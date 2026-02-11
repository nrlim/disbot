import { cn } from "@/lib/utils";
import Image from "next/image";

interface LogoProps {
    className?: string;
    classNameText?: string;
    showText?: boolean;
}

const Logo = ({ className, classNameText, showText = true }: LogoProps) => {
    return (
        <div className={cn("flex items-center gap-2 select-none", className)}>
            <div className="relative w-8 h-8 flex items-center justify-center">
                <Image
                    src="/main-logo.png"
                    alt="DISBOT Logo"
                    width={32}
                    height={32}
                    className="w-full h-full object-contain relative z-10"
                />
            </div>

            {showText && (
                <span className={cn("text-xl font-bold tracking-tight text-white", classNameText)}>
                    DISBOT
                </span>
            )}
        </div>
    );
};

export default Logo;
