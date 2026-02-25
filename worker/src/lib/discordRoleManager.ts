/**
 * Discord Role Manager — DB-Driven Configuration + Slash Commands
 *
 * Manages temporary role assignments with automatic expiry.
 * All configuration (bot token, guild, roles) is loaded from the
 * BotSettings table — NOT from environment variables.
 *
 * Architecture:
 *  - Singleton pattern for lightweight memory usage (512MB limit)
 *  - Reads BotSettings from Prisma on every sync cycle
 *  - Hot-reloads: if the Dashboard updates BotSettings, the manager
 *    will pick up the change on the next sync cycle and reconnect
 *  - Expiry cleaner runs every 10 minutes
 *
 * Slash Commands:
 *  /grant   — Select role → Modal for User ID & Duration → Assign
 *  /check   — Check a user's subscription status
 *  /extend  — Extend a user's subscription by N days
 *  /revoke  — Revoke a user's premium role immediately
 */

import {
    Client,
    GatewayIntentBits,
    Guild,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Colors,
    PermissionsBitField,
    ChatInputCommandInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    SlashCommandBuilder,
    Interaction,
    MessageFlags,
} from 'discord.js';
import { prisma } from './prisma';
import { logger } from './logger';
import { decrypt } from './crypto';

// ──────────────────────────────────────────────────────────────
//  Constants
// ──────────────────────────────────────────────────────────────

const EXPIRY_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CONFIG_SYNC_INTERVAL_MS = 60 * 1000;        // 1 minute — check for config changes
const BATCH_SIZE = 50;
const DM_ENABLED = true;

// Custom IDs for interactions
const SELECT_GRANT_ROLE = 'select_grant_role';
const MODAL_GRANT_DETAILS = 'modal_grant_details';
const INPUT_USER_ID = 'input_user_id';
const INPUT_DURATION = 'input_duration_days';

// Embed branding
const BRAND_COLOR = 0x5865F2; // Discord Blurple
const SUCCESS_COLOR = 0x57F287;
const ERROR_COLOR = 0xED4245;
const WARNING_COLOR = 0xFEE75C;
const INFO_COLOR = 0x5865F2;

// ──────────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────────

interface ManagerConfig {
    id: string;
    botToken: string;   // Decrypted token
    clientId: string;
    guildId: string;
    adminRoleId: string | null;
    trialRoleId: string | null;
    active: boolean;
}

// Temporary store for grant flow
interface PendingGrant {
    targetUserId: string;   // Set in Step 1 (/grant command)
    roleId?: string;       // Set in Step 2 (Role selected)
    roleName?: string;
    timestamp: number;
}

// ──────────────────────────────────────────────────────────────
//  Discord Role Manager (Singleton)
// ──────────────────────────────────────────────────────────────

export class DiscordRoleManager {
    private static instance: DiscordRoleManager;
    private client: Client | null = null;
    private expiryInterval: NodeJS.Timeout | null = null;
    private configSyncInterval: NodeJS.Timeout | null = null;
    private isChecking = false;
    private isReady = false;
    private currentConfig: ManagerConfig | null = null;
    private isShuttingDown = false;

    // In-memory store for pending /grant flows (userId → selected role)
    // Cleaned up after 5 minutes of inactivity
    private pendingGrants: Map<string, PendingGrant> = new Map();

    private constructor() { }

    public static getInstance(): DiscordRoleManager {
        if (!DiscordRoleManager.instance) {
            DiscordRoleManager.instance = new DiscordRoleManager();
        }
        return DiscordRoleManager.instance;
    }

    // ──────────────────────────────────────────────────────────────
    //  Lifecycle
    // ──────────────────────────────────────────────────────────────

    /**
     * Initialize the role manager: load config from DB, connect bot, start crons.
     */
    public async start(): Promise<void> {
        logger.info('[Manager] Starting Discord Role Manager...');

        // Load config from DB
        const config = await this.loadConfig();
        if (!config) {
            logger.warn('[Manager] No active BotSettings found in database — Manager will poll until configured');
        } else {
            await this.connectBot(config);
        }

        // Start the config sync loop (picks up Dashboard changes)
        this.configSyncInterval = setInterval(() => {
            this.syncConfig().catch((err) => {
                logger.error({ error: err.message }, '[Manager] Config sync failed');
            });
        }, CONFIG_SYNC_INTERVAL_MS);
        this.configSyncInterval.unref();

        // Start Vercel-to-VPS Heartbeat & Remote Restart Listener
        setInterval(async () => {
            if (this.currentConfig && !this.isShuttingDown) {
                try {
                    const settings = await prisma.botSettings.findUnique({ where: { id: this.currentConfig.id } });
                    if (settings) {
                        // 1. Send Heartbeat to DB
                        await prisma.botSettings.update({
                            where: { id: this.currentConfig.id },
                            data: { lastManagerHeartbeat: new Date() }
                        });

                        // 2. Check for Remote Restart request from Dashboard
                        if (settings.restartManagerAt && settings.restartManagerAt > new Date(Date.now() - 60000)) {
                            logger.info('[Manager] Remote restart requested from Dashboard via DB. Exiting for PM2 restart...');
                            await prisma.botSettings.update({
                                where: { id: this.currentConfig.id },
                                data: { restartManagerAt: null }
                            });
                            process.exit(0); // PM2 will automatically restart the process
                        }
                    }
                } catch (e: any) {
                    // Silently fail if DB is temporarily unreachable
                }
            }
        }, 15000).unref();

        // Start the expiry checker
        this.startExpiryChecker();

        // Clean up stale pending grants every 5 min
        setInterval(() => {
            const now = Date.now();
            for (const [key, val] of this.pendingGrants) {
                if (now - val.timestamp > 5 * 60 * 1000) {
                    this.pendingGrants.delete(key);
                }
            }
        }, 5 * 60 * 1000).unref();

        logger.info({
            configSyncMs: CONFIG_SYNC_INTERVAL_MS,
            expiryCheckMs: EXPIRY_CHECK_INTERVAL_MS,
            hasConfig: !!config,
        }, '[Manager] Role Manager initialized');
    }

    /**
     * Graceful shutdown — stop intervals and destroy client.
     */
    public async shutdown(): Promise<void> {
        this.isShuttingDown = true;

        if (this.expiryInterval) {
            clearInterval(this.expiryInterval);
            this.expiryInterval = null;
        }

        if (this.configSyncInterval) {
            clearInterval(this.configSyncInterval);
            this.configSyncInterval = null;
        }

        if (this.client) {
            this.client.destroy();
            this.client = null;
            this.isReady = false;
        }

        this.currentConfig = null;
        this.pendingGrants.clear();
        logger.info('[Manager] Shutdown complete');
    }

    // ──────────────────────────────────────────────────────────────
    //  Dynamic Configuration (DB-Driven)
    // ──────────────────────────────────────────────────────────────

    /**
     * Load BotSettings from the database.
     * Returns null if no active settings exist.
     */
    private async loadConfig(): Promise<ManagerConfig | null> {
        try {
            const settings = await prisma.botSettings.findFirst({
                where: { active: true },
                orderBy: { updatedAt: 'desc' }, // Most recently updated wins
            });

            if (!settings) return null;

            // Decrypt the bot token (stored encrypted by the Dashboard)
            let botToken = settings.botToken;
            const encryptionKey = process.env.ENCRYPTION_KEY || '';

            if (encryptionKey && botToken.includes(':')) {
                const decrypted = decrypt(botToken, encryptionKey);
                if (decrypted) {
                    botToken = decrypted;
                } else {
                    logger.error('[Manager] Failed to decrypt botToken — check ENCRYPTION_KEY');
                    return null;
                }
            }

            return {
                id: settings.id,
                botToken,
                clientId: settings.clientId,
                guildId: settings.guildId,
                adminRoleId: settings.adminRoleId,
                trialRoleId: settings.trialRoleId,
                active: settings.active,
            };

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] Failed to load BotSettings');
            return null;
        }
    }

    /**
     * Periodic config sync — detects Dashboard changes and reconnects if needed.
     */
    private async syncConfig(): Promise<void> {
        if (this.isShuttingDown) return;

        const newConfig = await this.loadConfig();

        // Case 1: No config in DB and we had one → disconnect
        if (!newConfig && this.currentConfig) {
            logger.info('[Manager] BotSettings removed/deactivated — disconnecting bot');
            await this.disconnectBot();
            return;
        }

        // Case 2: New config appeared (first time or re-enabled)
        if (newConfig && !this.currentConfig) {
            logger.info('[Manager] BotSettings detected — connecting bot');
            await this.connectBot(newConfig);
            return;
        }

        // Case 3: Config changed (token, guildId, etc.) → reconnect
        if (newConfig && this.currentConfig) {
            const changed =
                newConfig.botToken !== this.currentConfig.botToken ||
                newConfig.guildId !== this.currentConfig.guildId ||
                newConfig.clientId !== this.currentConfig.clientId ||
                newConfig.active !== this.currentConfig.active;

            if (changed) {
                logger.info('[Manager] BotSettings changed — reconnecting bot');
                await this.disconnectBot();

                if (newConfig.active) {
                    await this.connectBot(newConfig);
                }
            } else {
                // Update non-critical fields (trialRoleId, adminRoleId) without reconnect
                this.currentConfig.trialRoleId = newConfig.trialRoleId;
                this.currentConfig.adminRoleId = newConfig.adminRoleId;
            }
        }
    }

    /**
     * Connect the Discord bot client using config from DB.
     */
    private async connectBot(config: ManagerConfig): Promise<void> {
        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMembers,
                ],
            });

            this.client.on('clientReady', async () => {
                this.isReady = true;
                logger.info({
                    user: this.client?.user?.tag,
                    guilds: this.client?.guilds.cache.size,
                    targetGuild: config.guildId,
                }, '[Manager] Bot client ready');

                // Register slash commands on ready
                await this.registerSlashCommands(config);
            });

            this.client.on('error', (err) => {
                logger.error({ error: err.message }, '[Manager] Bot client error');
            });

            // Handle all interactions (slash commands, select menus, modals)
            this.client.on('interactionCreate', (interaction: Interaction) => {
                this.handleInteraction(interaction).catch((err) => {
                    logger.error({ error: err.message }, '[Manager] Interaction handler error');
                });
            });

            // Reconnect on disconnect
            this.client.on('shardDisconnect', () => {
                if (!this.isShuttingDown && this.currentConfig) {
                    logger.warn('[Manager] Bot disconnected — will reconnect on next sync cycle');
                    this.isReady = false;
                }
            });

            await this.client.login(config.botToken);
            this.currentConfig = config;

            logger.info({ clientId: config.clientId, guildId: config.guildId }, '[Manager] Bot connected');

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] Bot login failed — check BotSettings in Dashboard');
            this.client = null;
            this.currentConfig = null;
        }
    }

    /**
     * Disconnect and clean up the current bot client.
     */
    private async disconnectBot(): Promise<void> {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
        this.isReady = false;
        this.currentConfig = null;
    }

    // ──────────────────────────────────────────────────────────────
    //  Slash Command Registration
    // ──────────────────────────────────────────────────────────────

    /**
     * Register /grant, /check, /extend, /revoke as guild-scoped slash commands.
     */
    private async registerSlashCommands(config: ManagerConfig): Promise<void> {
        try {
            const commands = [
                new SlashCommandBuilder()
                    .setName('grant')
                    .setDescription('🎁 Grant a premium role to a user with a time-limited subscription')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('The user to grant the role to')
                            .setRequired(true)
                    )
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

                new SlashCommandBuilder()
                    .setName('check')
                    .setDescription('🔍 Check the subscription status of a user')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('The user to check')
                            .setRequired(true)
                    )
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

                new SlashCommandBuilder()
                    .setName('extend')
                    .setDescription('⏳ Extend a user\'s premium subscription by additional days')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('The user to extend')
                            .setRequired(true)
                    )
                    .addIntegerOption(option =>
                        option
                            .setName('days')
                            .setDescription('Number of days to add')
                            .setRequired(true)
                            .setMinValue(1)
                            .setMaxValue(3650)
                    )
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

                new SlashCommandBuilder()
                    .setName('revoke')
                    .setDescription('🚫 Immediately revoke a user\'s premium role and mark as expired')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('The user to revoke')
                            .setRequired(true)
                    )
                    .setDMPermission(false)
                    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
            ];

            const rest = new REST({ version: '10' }).setToken(config.botToken);

            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands.map(c => c.toJSON()) }
            );

            logger.info({
                commands: commands.map(c => `/${c.name}`),
                guildId: config.guildId,
            }, '[Manager] Slash commands registered');

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] Failed to register slash commands');
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Interaction Router
    // ──────────────────────────────────────────────────────────────

    /**
     * Central interaction handler — routes to the correct handler based on type.
     */
    private async handleInteraction(interaction: Interaction): Promise<void> {
        // 1. Slash Commands
        if (interaction.isChatInputCommand()) {
            // Permission check
            if (!await this.checkAdminPermission(interaction)) return;

            switch (interaction.commandName) {
                case 'grant':
                    return this.handleGrantCommand(interaction);
                case 'check':
                    return this.handleCheckCommand(interaction);
                case 'extend':
                    return this.handleExtendCommand(interaction);
                case 'revoke':
                    return this.handleRevokeCommand(interaction);
            }
        }

        // 2. Select Menu (Grant flow — Step 1 result)
        if (interaction.isStringSelectMenu() && interaction.customId === SELECT_GRANT_ROLE) {
            if (!await this.checkAdminPermissionComponent(interaction)) return;
            return this.handleGrantRoleSelected(interaction);
        }

        // 3. Modal Submit (Grant flow — Step 2 result)
        if (interaction.isModalSubmit() && interaction.customId === MODAL_GRANT_DETAILS) {
            return this.handleGrantModalSubmit(interaction);
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Permission Check
    // ──────────────────────────────────────────────────────────────

    /**
     * Verify that the interaction user has the Admin Role from BotSettings.
     * Falls back to Discord's Administrator permission if no adminRoleId is configured.
     */
    private async checkAdminPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
        const adminRoleId = this.currentConfig?.adminRoleId;
        const member = interaction.member;

        if (!member) {
            await interaction.reply({
                embeds: [this.errorEmbed('Permission Denied', 'This command can only be used in a server.')],
                flags: MessageFlags.Ephemeral,
            });
            return false;
        }

        // If adminRoleId is configured, check for that specific role
        if (adminRoleId) {
            const memberRoles = 'cache' in (member.roles as any)
                ? (member.roles as any).cache
                : member.roles;

            const hasAdminRole = memberRoles instanceof Map
                ? memberRoles.has(adminRoleId)
                : Array.isArray(memberRoles)
                    ? memberRoles.includes(adminRoleId)
                    : false;

            if (!hasAdminRole) {
                await interaction.reply({
                    embeds: [this.errorEmbed(
                        '🔒 Access Denied',
                        'You do not have the required **Admin Role** to use this command.\n\nContact a server administrator if you believe this is an error.'
                    )],
                    flags: MessageFlags.Ephemeral,
                });
                return false;
            }
        } else {
            // Fallback: require Discord Administrator permission
            const perms = member.permissions;
            const hasAdmin = typeof perms === 'string'
                ? (BigInt(perms) & PermissionsBitField.Flags.Administrator) !== 0n
                : (perms as PermissionsBitField).has(PermissionsBitField.Flags.Administrator);

            if (!hasAdmin) {
                await interaction.reply({
                    embeds: [this.errorEmbed(
                        '🔒 Access Denied',
                        'You need **Administrator** permission to use this command.\n\nSet an Admin Role in the Dashboard to allow non-admin users.'
                    )],
                    flags: MessageFlags.Ephemeral,
                });
                return false;
            }
        }

        return true;
    }

    /**
     * Permission check for component interactions (select menus, buttons).
     */
    private async checkAdminPermissionComponent(interaction: StringSelectMenuInteraction): Promise<boolean> {
        const adminRoleId = this.currentConfig?.adminRoleId;
        const member = interaction.member;

        if (!member) {
            await interaction.reply({
                embeds: [this.errorEmbed('Permission Denied', 'This can only be used in a server.')],
                flags: MessageFlags.Ephemeral,
            });
            return false;
        }

        if (adminRoleId) {
            const memberRoles = 'cache' in (member.roles as any)
                ? (member.roles as any).cache
                : member.roles;

            const hasAdminRole = memberRoles instanceof Map
                ? memberRoles.has(adminRoleId)
                : Array.isArray(memberRoles)
                    ? memberRoles.includes(adminRoleId)
                    : false;

            if (!hasAdminRole) {
                await interaction.reply({
                    embeds: [this.errorEmbed('🔒 Access Denied', 'You do not have the required Admin Role.')],
                    flags: MessageFlags.Ephemeral,
                });
                return false;
            }
        }

        return true;
    }

    // ──────────────────────────────────────────────────────────────
    //  /grant — Multi-Step Flow (Select Menu → Modal → Execute)
    // ──────────────────────────────────────────────────────────────

    /**
     * Step 1: Show a StringSelectMenu with all available guild roles.
     */
    private async handleGrantCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!this.client || !this.currentConfig) {
            await interaction.reply({
                embeds: [this.errorEmbed('Bot Not Ready', 'The Role Manager is still initializing. Please try again in a moment.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const targetUser = interaction.options.getUser('user', true);

        // Store the target user in the pending flow
        this.pendingGrants.set(interaction.user.id, {
            targetUserId: targetUser.id,
            timestamp: Date.now(),
        });

        try {
            const guild = await this.client.guilds.fetch(this.currentConfig.guildId);
            const roles = guild.roles.cache
                .filter(r => r.name !== '@everyone' && !r.managed && r.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .first(25); // Discord limit: 25 options

            if (!roles || roles.length === 0) {
                await interaction.reply({
                    embeds: [this.errorEmbed('No Roles Found', 'No assignable roles found in this server.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(SELECT_GRANT_ROLE)
                .setPlaceholder('🎯 Select a role to grant...')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                    roles.map(role =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(role.name)
                            .setDescription(`ID: ${role.id}`)
                            .setValue(role.id)
                            .setEmoji(role.unicodeEmoji || '🏷️')
                    )
                );

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🎁 Grant Premium Role — Step 1/2')
                .setDescription(
                    `Select the **role** you want to assign to <@${targetUser.id}>.\n\n` +
                    `> After selecting a role, you'll be prompted to enter the **duration**.`
                )
                .setColor(BRAND_COLOR)
                .setFooter({ text: 'DisBot Manager • Role Grant Flow' })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral,
            });

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] /grant command failed');
            await interaction.reply({
                embeds: [this.errorEmbed('Error', `Failed to load roles: ${err.message}`)],
                flags: MessageFlags.Ephemeral,
            });
        }
    }

    /**
     * Step 2: Role selected → show Modal for Duration.
     */
    private async handleGrantRoleSelected(interaction: StringSelectMenuInteraction): Promise<void> {
        const pending = this.pendingGrants.get(interaction.user.id);

        if (!pending) {
            await interaction.reply({
                embeds: [this.errorEmbed('Session Expired', 'Your grant session has expired. Please run `/grant` again.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const selectedRoleId = interaction.values[0];

        // Resolve role name
        const guild = interaction.guild;
        const role = guild?.roles.cache.get(selectedRoleId);
        const roleName = role?.name || selectedRoleId;

        // Update the pending grant with the selected role
        pending.roleId = selectedRoleId;
        pending.roleName = roleName;
        pending.timestamp = Date.now();
        this.pendingGrants.set(interaction.user.id, pending);

        // Build the modal
        const modal = new ModalBuilder()
            .setCustomId(MODAL_GRANT_DETAILS)
            .setTitle(`Grant: ${roleName}`);

        const durationInput = new TextInputBuilder()
            .setCustomId(INPUT_DURATION)
            .setLabel('Duration (Days)')
            .setPlaceholder('e.g. 30')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(4)
            .setValue('30');

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput),
        );

        await interaction.showModal(modal);
    }

    /**
     * Step 3: Modal submitted → execute the grant.
     */
    private async handleGrantModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
        const pending = this.pendingGrants.get(interaction.user.id);

        if (!pending || !pending.targetUserId || !pending.roleId) {
            await interaction.reply({
                embeds: [this.errorEmbed('Session Expired', 'Your grant session has expired or is invalid. Please run `/grant` again.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const targetUserId = pending.targetUserId;
        const durationStr = interaction.fields.getTextInputValue(INPUT_DURATION).trim();
        const durationDays = parseInt(durationStr, 10);

        // Clean up pending state
        this.pendingGrants.delete(interaction.user.id);

        // Validate inputs
        if (isNaN(durationDays) || durationDays < 1 || durationDays > 3650) {
            await interaction.reply({
                embeds: [this.errorEmbed('Invalid Duration', 'Duration must be between **1** and **3650** days.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Execute the grant
        const result = await this.assignRole(targetUserId, pending.roleId, durationDays);

        if (result.success) {
            const embed = new EmbedBuilder()
                .setTitle('✅ Role Granted Successfully')
                .setColor(SUCCESS_COLOR)
                .addFields(
                    { name: '👤 User', value: `<@${targetUserId}>`, inline: true },
                    { name: '🏷️ Role', value: `**${pending.roleName}**`, inline: true },
                    { name: '📅 Duration', value: `${durationDays} days`, inline: true },
                    {
                        name: '⏰ Expires', value: result.expiryDate
                            ? `<t:${Math.floor(result.expiryDate.getTime() / 1000)}:F>`
                            : 'Unknown', inline: false
                    },
                )
                .setFooter({ text: `Granted by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                embeds: [this.errorEmbed('Grant Failed', result.error || 'An unknown error occurred.')],
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  /check — View User Subscription Status
    // ──────────────────────────────────────────────────────────────

    private async handleCheckCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guildId = this.currentConfig?.guildId;
            if (!guildId) {
                await interaction.editReply({
                    embeds: [this.errorEmbed('Not Configured', 'Guild ID is not set in BotSettings.')],
                });
                return;
            }

            const record = await prisma.discordUser.findUnique({
                where: {
                    discordId_guildId: { discordId: targetUser.id, guildId },
                },
            });

            if (!record) {
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Subscription Status')
                    .setColor(WARNING_COLOR)
                    .setDescription(`<@${targetUser.id}> has **no subscription record** in the database.`)
                    .addFields(
                        { name: '👤 User', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: false },
                        { name: '📋 Status', value: '`NO RECORD`', inline: true },
                    )
                    .setFooter({ text: 'DisBot Manager • Subscription Check' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            const isActive = record.status === 'ACTIVE';
            const isExpired = record.expiryDate < new Date();
            const expiryTimestamp = Math.floor(record.expiryDate.getTime() / 1000);

            // Resolve role name
            const guild = interaction.guild;
            const roleName = guild?.roles.cache.get(record.currentRole)?.name || record.currentRole;

            // Calculate remaining time
            const now = new Date();
            const diffMs = record.expiryDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const remainingText = isExpired
                ? '**Expired**'
                : `**${diffDays}** day${diffDays !== 1 ? 's' : ''} remaining`;

            const statusEmoji = isActive && !isExpired ? '🟢' : isActive && isExpired ? '🟡' : '🔴';
            const statusText = isActive && !isExpired ? 'ACTIVE' : isActive && isExpired ? 'PENDING CLEANUP' : 'EXPIRED';

            const embed = new EmbedBuilder()
                .setTitle('🔍 Subscription Status')
                .setColor(isActive && !isExpired ? SUCCESS_COLOR : isExpired ? WARNING_COLOR : ERROR_COLOR)
                .addFields(
                    { name: '👤 User', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: false },
                    { name: `${statusEmoji} Status`, value: `\`${statusText}\``, inline: true },
                    { name: '🏷️ Role', value: `**${roleName}**`, inline: true },
                    { name: '⏱️ Remaining', value: remainingText, inline: true },
                    { name: '📅 Expiry Date', value: `<t:${expiryTimestamp}:F>\n<t:${expiryTimestamp}:R>`, inline: false },
                    { name: '🕐 Assigned At', value: `<t:${Math.floor(record.assignedAt.getTime() / 1000)}:F>`, inline: true },
                    { name: '🔄 Last Updated', value: `<t:${Math.floor(record.updatedAt.getTime() / 1000)}:R>`, inline: true },
                )
                .setFooter({ text: 'DisBot Manager • Subscription Check' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] /check command failed');
            await interaction.editReply({
                embeds: [this.errorEmbed('Error', `Failed to check user: ${err.message}`)],
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  /extend — Add Days to Existing Subscription
    // ──────────────────────────────────────────────────────────────

    private async handleExtendCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user', true);
        const days = interaction.options.getInteger('days', true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = await this.extendRole(targetUser.id, days);

            if (result.success && result.newExpiryDate) {
                const expiryTimestamp = Math.floor(result.newExpiryDate.getTime() / 1000);

                const embed = new EmbedBuilder()
                    .setTitle('⏳ Subscription Extended')
                    .setColor(SUCCESS_COLOR)
                    .addFields(
                        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                        { name: '➕ Added', value: `**${days}** day${days !== 1 ? 's' : ''}`, inline: true },
                        { name: '📅 New Expiry', value: `<t:${expiryTimestamp}:F>\n<t:${expiryTimestamp}:R>`, inline: false },
                    )
                    .setFooter({ text: `Extended by ${interaction.user.tag}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply({
                    embeds: [this.errorEmbed('Extension Failed', result.error || 'An unknown error occurred.')],
                });
            }

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] /extend command failed');
            await interaction.editReply({
                embeds: [this.errorEmbed('Error', `Failed to extend subscription: ${err.message}`)],
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  /revoke — Immediately Revoke Premium Role
    // ──────────────────────────────────────────────────────────────

    private async handleRevokeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guildId = this.currentConfig?.guildId;
            if (!guildId || !this.client) {
                await interaction.editReply({
                    embeds: [this.errorEmbed('Not Ready', 'Bot is not connected or guild is not configured.')],
                });
                return;
            }

            // 1. Look up the DB record
            const record = await prisma.discordUser.findUnique({
                where: {
                    discordId_guildId: { discordId: targetUser.id, guildId },
                },
            });

            if (!record) {
                await interaction.editReply({
                    embeds: [this.errorEmbed('No Record', `<@${targetUser.id}> has no subscription record to revoke.`)],
                });
                return;
            }

            // 2. Remove the premium role in Discord
            try {
                const guild = await this.client.guilds.fetch(guildId);
                const member = await guild.members.fetch(targetUser.id).catch(() => null);

                if (member) {
                    const premiumRole = guild.roles.cache.get(record.currentRole);
                    if (premiumRole && member.roles.cache.has(record.currentRole)) {
                        await member.roles.remove(premiumRole, `Manual revoke by ${interaction.user.tag}`);
                    }

                    // Assign trial role if configured
                    const trialRoleId = this.currentConfig?.trialRoleId;
                    if (trialRoleId) {
                        const trialRole = guild.roles.cache.get(trialRoleId);
                        if (trialRole && !member.roles.cache.has(trialRoleId)) {
                            await member.roles.add(trialRole, 'Manual revoke — reverted to trial');
                        }
                    }
                }
            } catch (err: any) {
                logger.warn({ error: err.message }, '[Manager] Could not modify Discord roles during revoke');
            }

            // 3. Update DB status to EXPIRED
            const roleName = interaction.guild?.roles.cache.get(record.currentRole)?.name || record.currentRole;

            await prisma.discordUser.update({
                where: { id: record.id },
                data: { status: 'EXPIRED' },
            });

            const embed = new EmbedBuilder()
                .setTitle('🚫 Role Revoked')
                .setColor(ERROR_COLOR)
                .addFields(
                    { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                    { name: '🏷️ Removed Role', value: `**${roleName}**`, inline: true },
                    { name: '📋 New Status', value: '`EXPIRED`', inline: true },
                    {
                        name: '🔄 Trial Role', value: this.currentConfig?.trialRoleId
                            ? `Assigned <@&${this.currentConfig.trialRoleId}>`
                            : 'None configured', inline: false
                    },
                )
                .setFooter({ text: `Revoked by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            logger.info({
                targetUserId: targetUser.id,
                revokedBy: interaction.user.id,
                roleName,
            }, '[Manager] Role revoked via /revoke command');

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] /revoke command failed');
            await interaction.editReply({
                embeds: [this.errorEmbed('Error', `Failed to revoke role: ${err.message}`)],
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Embed Helpers
    // ──────────────────────────────────────────────────────────────

    private errorEmbed(title: string, description: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setColor(ERROR_COLOR)
            .setFooter({ text: 'DisBot Manager' })
            .setTimestamp();
    }

    // ──────────────────────────────────────────────────────────────
    //  Role Assignment
    // ──────────────────────────────────────────────────────────────

    /**
     * Assign a premium role to a user with a temporary duration.
     *
     * @param userId        Discord User ID (snowflake)
     * @param roleId        Discord Role ID to assign (Premium/Pro/Elite)
     * @param durationDays  How long the role lasts (e.g., 30 for monthly sub)
     * @param guildId       Optional — defaults to BotSettings.guildId
     */
    public async assignRole(
        userId: string,
        roleId: string,
        durationDays: number,
        guildId?: string
    ): Promise<{ success: boolean; expiryDate?: Date; error?: string }> {
        if (!this.client || !this.isReady || !this.currentConfig) {
            return { success: false, error: 'Role Manager bot is not ready' };
        }

        const targetGuildId = guildId || this.currentConfig.guildId;

        try {
            // 1. Fetch guild & member
            const guild = await this.client.guilds.fetch(targetGuildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return { success: false, error: `User ${userId} not found in guild ${targetGuildId}` };
            }

            // 2. Validate role exists
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                return { success: false, error: `Role ${roleId} not found in guild ${targetGuildId}` };
            }

            // 3. Calculate expiry
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + durationDays);

            // 4. Assign role in Discord
            await member.roles.add(role, `Auto-Role: Subscription for ${durationDays} days`);

            // 5. Upsert in DB (handles renewals)
            await prisma.discordUser.upsert({
                where: {
                    discordId_guildId: { discordId: userId, guildId: targetGuildId },
                },
                update: {
                    currentRole: roleId,
                    expiryDate,
                    status: 'ACTIVE',
                },
                create: {
                    discordId: userId,
                    guildId: targetGuildId,
                    currentRole: roleId,
                    expiryDate,
                    status: 'ACTIVE',
                },
            });

            logger.info({
                userId,
                roleId,
                guildId: targetGuildId,
                durationDays,
                expiryDate: expiryDate.toISOString(),
            }, '[Manager] Role assigned');

            return { success: true, expiryDate };

        } catch (err: any) {
            logger.error({ error: err.message, userId, roleId }, '[Manager] assignRole failed');
            return { success: false, error: err.message };
        }
    }

    /**
     * Extend an existing role assignment by additional days.
     */
    public async extendRole(
        userId: string,
        additionalDays: number,
        guildId?: string
    ): Promise<{ success: boolean; newExpiryDate?: Date; error?: string }> {
        const targetGuildId = guildId || this.currentConfig?.guildId;
        if (!targetGuildId) return { success: false, error: 'No guildId configured' };

        try {
            const existing = await prisma.discordUser.findUnique({
                where: { discordId_guildId: { discordId: userId, guildId: targetGuildId } },
            });

            if (!existing) {
                return { success: false, error: 'No role assignment found for this user' };
            }

            // Extend from current expiry (if still active) or from now (if expired)
            const baseDate = existing.expiryDate > new Date() ? existing.expiryDate : new Date();
            const newExpiryDate = new Date(baseDate);
            newExpiryDate.setDate(newExpiryDate.getDate() + additionalDays);

            await prisma.discordUser.update({
                where: { id: existing.id },
                data: { expiryDate: newExpiryDate, status: 'ACTIVE' },
            });

            // Re-assign role in Discord if it was expired/removed
            if (existing.status === 'EXPIRED' && this.client && this.isReady) {
                try {
                    const guild = await this.client.guilds.fetch(targetGuildId);
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        const role = guild.roles.cache.get(existing.currentRole);
                        if (role && !member.roles.cache.has(existing.currentRole)) {
                            await member.roles.add(role, 'Auto-Role: Subscription renewed');
                        }
                    }
                } catch (err: any) {
                    logger.warn({ error: err.message }, '[Manager] Could not re-assign role on renewal');
                }
            }

            logger.info({ userId, additionalDays, newExpiryDate: newExpiryDate.toISOString() }, '[Manager] Role extended');
            return { success: true, newExpiryDate };

        } catch (err: any) {
            logger.error({ error: err.message, userId }, '[Manager] extendRole failed');
            return { success: false, error: err.message };
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Auto-Revert Cleaner (Cron Pattern)
    // ──────────────────────────────────────────────────────────────

    /**
     * Start the periodic expiry checker.
     */
    private startExpiryChecker(): void {
        // Run immediately
        this.checkRoleExpirations().catch((err) => {
            logger.error({ error: err.message }, '[Manager] Initial expiry check failed');
        });

        // Schedule every 10 minutes
        this.expiryInterval = setInterval(() => {
            this.checkRoleExpirations().catch((err) => {
                logger.error({ error: err.message }, '[Manager] Expiry check failed');
            });
        }, EXPIRY_CHECK_INTERVAL_MS);
        this.expiryInterval.unref();
    }

    /**
     * Core expiry logic:
     *   1. Find all DiscordUser where expiryDate < NOW and status = ACTIVE
     *   2. Remove the Premium Role in Discord
     *   3. Assign the Trial/Normal role (from BotSettings.trialRoleId)
     *   4. Update status to EXPIRED
     *   5. Send DM notification
     */
    public async checkRoleExpirations(): Promise<void> {
        if (this.isChecking || !this.client || !this.isReady) return;
        this.isChecking = true;

        try {
            const now = new Date();

            // 1. Fetch expired ACTIVE users in batches
            const expiredUsers = await prisma.discordUser.findMany({
                where: {
                    expiryDate: { lt: now },
                    status: 'ACTIVE',
                },
                take: BATCH_SIZE,
                orderBy: { expiryDate: 'asc' },
            });

            if (expiredUsers.length === 0) {
                logger.debug('[Manager] No expired roles to process');
                this.isChecking = false;
                return;
            }

            logger.info({ count: expiredUsers.length }, '[Manager] Processing expired role assignments');

            let processed = 0;
            let failed = 0;

            for (const record of expiredUsers) {
                try {
                    await this.processExpiredRole(record);
                    processed++;
                } catch (err: any) {
                    failed++;
                    logger.error({
                        error: err.message,
                        discordId: record.discordId,
                        roleId: record.currentRole,
                    }, '[Manager] Failed to process expired role');
                }
            }

            logger.info({ processed, failed, total: expiredUsers.length }, '[Manager] Expiry cycle complete');

        } catch (err: any) {
            logger.error({ error: err.message }, '[Manager] Expiry check error');
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Process a single expired user:
     *   - Remove premium role
     *   - Assign trial role (if configured)
     *   - Update status → EXPIRED
     *   - Send DM
     */
    private async processExpiredRole(record: {
        id: string;
        discordId: string;
        guildId: string;
        currentRole: string;
    }): Promise<void> {
        if (!this.client) return;

        let guild: Guild;
        try {
            guild = await this.client.guilds.fetch(record.guildId);
        } catch {
            logger.warn({ guildId: record.guildId }, '[Manager] Guild not accessible — cleaning up record');
            await prisma.discordUser.update({
                where: { id: record.id },
                data: { status: 'EXPIRED' },
            });
            return;
        }

        const member = await guild.members.fetch(record.discordId).catch(() => null);

        if (member) {
            // Remove the premium role
            const premiumRole = guild.roles.cache.get(record.currentRole);
            if (premiumRole && member.roles.cache.has(record.currentRole)) {
                await member.roles.remove(premiumRole, 'Auto-Role: Subscription expired');
                logger.info({
                    discordId: record.discordId,
                    roleId: record.currentRole,
                }, '[Manager] Premium role removed');
            }

            // Assign the trial/normal role (from BotSettings)
            const trialRoleId = this.currentConfig?.trialRoleId;
            if (trialRoleId) {
                const trialRole = guild.roles.cache.get(trialRoleId);
                if (trialRole && !member.roles.cache.has(trialRoleId)) {
                    await member.roles.add(trialRole, 'Auto-Role: Reverted to trial/normal');
                    logger.info({
                        discordId: record.discordId,
                        trialRoleId,
                    }, '[Manager] Trial role assigned');
                }
            }

            // Send DM
            if (DM_ENABLED) {
                await this.sendExpiryDM(member, guild.name);
            }
        } else {
            logger.warn({
                discordId: record.discordId,
                guildId: record.guildId,
            }, '[Manager] Member not found — may have left the server');
        }

        // Update status to EXPIRED
        await prisma.discordUser.update({
            where: { id: record.id },
            data: { status: 'EXPIRED' },
        });
    }

    /**
     * Send expiry DM — wrapped in try-catch (users can disable DMs).
     */
    private async sendExpiryDM(member: any, guildName: string): Promise<void> {
        try {
            const embed = new EmbedBuilder()
                .setTitle('⏰ Premium Access Expired')
                .setDescription(
                    `Your premium access in **${guildName}** has expired.\n\n` +
                    `Your role has been reverted. Please subscribe to continue enjoying premium features!`
                )
                .setColor(WARNING_COLOR)
                .setFooter({ text: 'DisBot Manager • Auto-Expiry Notification' })
                .setTimestamp();

            await member.send({ embeds: [embed] });
            logger.debug({ discordId: member.id }, '[Manager] Expiry DM sent');
        } catch {
            logger.debug({ discordId: member.id }, '[Manager] Could not send expiry DM');
        }
    }

    // ──────────────────────────────────────────────────────────────
    //  Health & Status
    // ──────────────────────────────────────────────────────────────

    public getStatus(): {
        ready: boolean;
        guilds: number;
        configLoaded: boolean;
        guildId: string | null;
    } {
        return {
            ready: this.isReady,
            guilds: this.client?.guilds.cache.size ?? 0,
            configLoaded: !!this.currentConfig,
            guildId: this.currentConfig?.guildId ?? null,
        };
    }
}
