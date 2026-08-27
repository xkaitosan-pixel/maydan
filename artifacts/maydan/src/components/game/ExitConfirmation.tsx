import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";

interface ExitConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExit?: () => void;
}

export function ExitConfirmation({ open, onOpenChange, onExit }: ExitConfirmationProps) {
  const [, navigate] = useLocation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs text-right" dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold">هل أنت متأكد؟</AlertDialogTitle>
          <AlertDialogDescription className="text-base text-muted-foreground">
            ستفقد تقدمك في هذا التحدي إذا خرجت الآن.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
          <AlertDialogCancel className="flex-1 mt-0">إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (onExit) onExit();
              else navigate("/");
            }}
          >
            خروج
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
