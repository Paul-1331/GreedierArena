import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ArrowLeft, Loader2, Trash2, RotateCcw, Undo2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";

interface CreatorActions {
  onDelete?: (quizId: string) => void;
  onWithdraw?: (quizId: string) => void;
  onResubmit?: (quizId: string) => void;
  onEdit?: (quizId: string) => void;
  isPending?: boolean;
}

interface AdminActions {
  onApprove: (quizId: string) => void;
  onReject: (quizId: string) => void;
  onDelete?: (quizId: string) => void;
  isPending?: boolean;
}

interface QuizDetailViewerProps {
  quizId: string;
  quizTitle: string;
  quizCategory: string;
  quizDifficulty: string;
  quizStatus: string;
  quizDescription?: string;
  onBack: () => void;
  adminActions?: AdminActions;
  creatorActions?: CreatorActions;
}

const optionLabels = ["A", "B", "C", "D"];

const statusStyles: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Pending Review", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

const typeLabels: Record<string, string> = {
  single_mcq: "Single Choice",
  multi_select: "Multiple Choice",
  numeric: "Numeric",
};

const QuizDetailViewer = ({
  quizId,
  quizTitle,
  quizCategory,
  quizDifficulty,
  quizStatus,
  quizDescription,
  onBack,
  adminActions,
  creatorActions,
}: QuizDetailViewerProps) => {
  const { data: questions, isLoading } = useQuery({
    queryKey: ["quiz-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const status = statusStyles[quizStatus] ?? statusStyles.draft;
  const isPending = adminActions?.isPending || creatorActions?.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">{quizTitle}</h2>
            {quizDescription && (
              <p className="mt-1 text-sm text-muted-foreground">{quizDescription}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">{quizCategory}</Badge>
              <span className="capitalize">{quizDifficulty}</span>
              <span>·</span>
              <span>{questions?.length ?? 0} questions</span>
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      {/* Questions */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {questions?.map((q, i) => {
            const qType = (q as any).question_type || "single_mcq";
            const options = (q.options as Json[]) as string[];
            const correctAnswer = q.correct_answer;

            return (
              <div key={q.id} className="rounded-lg border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <p className="font-body text-sm font-medium text-foreground">
                    <span className="mr-2 text-muted-foreground">Q{i + 1}.</span>
                    {q.question_text}
                  </p>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                    {typeLabels[qType] || qType}
                  </Badge>
                </div>

                {/* Single MCQ / Multi-select options */}
                {(qType === "single_mcq" || qType === "multi_select") && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {options.map((opt, oi) => {
                      const isCorrect = qType === "single_mcq"
                        ? oi === (correctAnswer as number)
                        : Array.isArray(correctAnswer) && (correctAnswer as number[]).includes(oi);
                      return (
                        <div
                          key={oi}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-body transition-colors ${
                            isCorrect
                              ? "border-primary/40 bg-primary/5 text-foreground"
                              : "border-border bg-background text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              isCorrect
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {optionLabels[oi]}
                          </span>
                          <span>{String(opt)}</span>
                          {isCorrect && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numeric answer display */}
                {qType === "numeric" && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-body">
                    <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground">Answer: <span className="font-semibold">{String(correctAnswer)}</span></span>
                  </div>
                )}

                {q.explanation && (
                  <p className="mt-2 text-xs text-muted-foreground italic">{q.explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Creator Actions */}
      {creatorActions && (creatorActions.onDelete || creatorActions.onWithdraw || creatorActions.onResubmit || creatorActions.onEdit) && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-card p-4">
          {creatorActions.onEdit && (
            <Button onClick={() => creatorActions.onEdit!(quizId)} disabled={isPending} variant="outline" className="gap-2">
              <PenLine className="h-4 w-4" />
              Edit Quiz
            </Button>
          )}
          {creatorActions.onResubmit && (
            <Button onClick={() => creatorActions.onResubmit!(quizId)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Resubmit for Review
            </Button>
          )}
          {creatorActions.onWithdraw && (
            <Button variant="outline" onClick={() => creatorActions.onWithdraw!(quizId)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Withdraw to Draft
            </Button>
          )}
          {creatorActions.onDelete && (
            <Button variant="destructive" onClick={() => creatorActions.onDelete!(quizId)} disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Quiz
            </Button>
          )}
        </div>
      )}

      {/* Admin Actions */}
      {adminActions && quizStatus === "submitted" && (
        <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
          <Button onClick={() => adminActions.onApprove(quizId)} disabled={isPending} className="flex-1 gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Approve
          </Button>
          <Button variant="destructive" onClick={() => adminActions.onReject(quizId)} disabled={isPending} className="flex-1 gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </Button>
        </div>
      )}

      {/* Admin Delete (any status) */}
      {adminActions?.onDelete && (
        <div className="flex gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <Button variant="destructive" onClick={() => adminActions.onDelete!(quizId)} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete Quiz (Admin)
          </Button>
          <p className="flex items-center text-xs text-muted-foreground">
            Permanently removes this quiz and all associated data.
          </p>
        </div>
      )}
    </div>
  );
};

export default QuizDetailViewer;
