import {
  CheckCircle,
  DangerCircle,
  DangerTriangle,
  InfoCircle,
  RefreshCircle,
} from "@solar-icons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckCircle size={16} weight="Bold" className="h-4 w-4" />,
        info: <InfoCircle size={16} weight="Bold" className="h-4 w-4" />,
        warning: <DangerTriangle size={16} weight="Bold" className="h-4 w-4" />,
        error: <DangerCircle size={16} weight="Bold" className="h-4 w-4" />,
        loading: (
          <RefreshCircle
            size={16}
            weight="Bold"
            className="h-4 w-4 animate-spin"
          />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
