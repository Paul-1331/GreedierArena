import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Clock, CheckCircle, XCircle, Trash2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QuizDetailViewer from "@/components/QuizDetailViewer";
import type { EditQuizData } from "@/components/creator/CreateQuizForm";
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

const statusConfig = {
  draft: { label: "Draft", icon: FileText, variant: "secondary" as const },
  submitted: { label: "Pending Review", icon: Clock, variant: "outline" as const },
  approved: { label: "Approved", icon: CheckCircle, variant: "default" as const },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive" as const },
};

interface SelectedQuiz {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  status: string;
  description: string | null;
  time_limit_seconds: number | null;
}

interface MyQuizzesListProps {
  onEditQuiz: (quiz: EditQuizData) => void;
  isAdmin?: boolean;
}

const MyQuizzesList = ({ onEditQuiz, isAdmin }: MyQuizzesListProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedQuiz, setSelectedQuiz] = useState<SelectedQuiz | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const { data: myQuizzes, isLoading } = useQuery({
    queryKey: ["my-quizzes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, category, difficulty, status, description, created_at, time_limit_seconds")
        .eq("creator_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const { error: qErr } = await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
      if (qErr) throw qErr;
      const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      setDeleteTarget(null);
      setSelectedQuiz(null);
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const withdrawQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const { error } = await supabase.from("quizzes").update({ status: "draft" }).eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiz withdrawn to draft");
      setSelectedQuiz((prev) => prev ? { ...prev, status: "draft" } : null);
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resubmitQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const { error } = await supabase.from("quizzes").update({ status: "submitted" }).eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiz resubmitted for review");
      setSelectedQuiz((prev) => prev ? { ...prev, status: "submitted" } : null);
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canDelete = (status: string) => ["draft", "submitted", "rejected"].includes(status);
  const canEdit = (status: string) => status !== "approved" || isAdmin;

  if (selectedQuiz) {
    return (
      <>
        <QuizDetailViewer
          quizId={selectedQuiz.id}
          quizTitle={selectedQuiz.title}
          quizCategory={selectedQuiz.category}
          quizDifficulty={selectedQuiz.difficulty}
          quizStatus={selectedQuiz.status}
          quizDescription={selectedQuiz.description ?? undefined}
          onBack={() => setSelectedQuiz(null)}
          creatorActions={{
            onEdit: canEdit(selectedQuiz.status) ? () => onEditQuiz(selectedQuiz) : undefined,
            onDelete: canDelete(selectedQuiz.status) ? (id) => setDeleteTarget({ id, title: selectedQuiz.title }) : undefined,
            onWithdraw: selectedQuiz.status === "submitted" ? (id) => withdrawQuiz.mutate(id) : undefined,
            onResubmit: selectedQuiz.status === "rejected" ? (id) => resubmitQuiz.mutate(id) : undefined,
            isPending: deleteQuiz.isPending || withdrawQuiz.isPending || resubmitQuiz.isPending,
          }}
        />
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete quiz?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{deleteTarget?.title}" and all its questions. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteQuiz.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteQuiz.mutate(deleteTarget.id)}
                disabled={deleteQuiz.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteQuiz.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!myQuizzes || myQuizzes.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <FileText className="mx-auto mb-3 h-10 w-10" />
        <p className="font-body">You haven't created any quizzes yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {myQuizzes.map((quiz) => {
          const config = statusConfig[quiz.status as keyof typeof statusConfig];
          const deletable = canDelete(quiz.status);
          const editable = canEdit(quiz.status);
          return (
            <div
              key={quiz.id}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <button
                onClick={() => setSelectedQuiz(quiz)}
                className="flex-1 text-left"
              >
                <p className="font-body text-sm font-medium text-foreground">{quiz.title}</p>
                <p className="text-xs text-muted-foreground">{quiz.category} · {quiz.difficulty}</p>
              </button>
              <div className="flex items-center gap-2">
                <Badge variant={config.variant} className="gap-1 text-xs">
                  <config.icon className="h-3 w-3" />
                  {config.label}
                </Badge>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditQuiz(quiz);
                    }}
                  >
                    <PenLine className="h-4 w-4" />
                  </Button>
                )}
                {deletable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: quiz.id, title: quiz.title });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.title}" and all its questions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuiz.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteQuiz.mutate(deleteTarget.id)}
              disabled={deleteQuiz.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteQuiz.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MyQuizzesList;
