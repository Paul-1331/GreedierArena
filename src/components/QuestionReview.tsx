import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

const getQuestionType = (q: { question_type?: string }): string => {
  const t = q.question_type || "single_mcq";
  if (t === "multi_mcq") return "multi_select";
  return t;
};

const getCorrectAnswer = (q: { correct_answer: Json }, questionType: string): number | number[] => {
  const ca = q.correct_answer;
  if (questionType === "multi_select") {
    if (Array.isArray(ca)) return ca as number[];
    if (typeof ca === "number") return [ca];
    return [0];
  }
  if (Array.isArray(ca)) return ca as number[];
  if (typeof ca === "number") return ca;
  return 0;
};

interface AnswerInfo {
  question_id?: string;
  questionId?: string;
  selected: any;
  is_correct?: boolean;
  isCorrect?: boolean;
  correct?: any;
  points?: number;
  time_taken_ms?: number;
}

interface QuestionReviewProps {
  quizId: string;
  answers: AnswerInfo[];
}

const QuestionReview = ({ quizId, answers }: QuestionReviewProps) => {
  const { data: questions, isLoading } = useQuery({
    queryKey: ["review-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("id, question_text, question_type, options, correct_answer, order_index, explanation")
        .eq("quiz_id", quizId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!quizId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!questions?.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No questions found.</p>;
  }

  // Build answer map by question_id
  const answerMap = new Map<string, AnswerInfo>();
  answers.forEach((a) => {
    const qid = a.question_id || a.questionId;
    if (qid) answerMap.set(qid, a);
  });

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const answer = answerMap.get(q.id);
        const qType = getQuestionType(q);
        const correct = getCorrectAnswer(q, qType);
        const options = (q.options as Json[]) as string[];
        const wasCorrect = answer?.is_correct ?? answer?.isCorrect ?? false;
        const userSelected = answer?.selected;

        return (
          <div key={q.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              {answer ? (
                wasCorrect ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )
              ) : (
                <span className="mt-0.5 h-4 w-4 shrink-0 text-xs text-muted-foreground">—</span>
              )}
              <p className="text-sm font-medium text-foreground">{q.question_text}</p>
            </div>

            {/* Options display */}
            <div className="ml-12 space-y-1.5">
              {qType === "numeric" ? (
                <div className="space-y-1 text-xs">
                  <p>
                    Correct answer: <span className="font-medium text-primary">{String(correct)}</span>
                  </p>
                  {answer && (
                    <p>
                      Your answer:{" "}
                      <span className={wasCorrect ? "font-medium text-primary" : "text-destructive"}>
                        {String(userSelected) || "No answer"}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                options.map((opt, oi) => {
                  const isCorrectOption =
                    qType === "multi_select"
                      ? (correct as number[]).includes(oi)
                      : correct === oi;
                  const isUserSelected =
                    qType === "multi_select"
                      ? Array.isArray(userSelected) && userSelected.includes(oi)
                      : userSelected === oi;

                  let bg = "bg-muted/30";
                  let border = "border-transparent";
                  let textColor = "text-foreground";

                  if (isCorrectOption) {
                    bg = "bg-primary/10";
                    border = "border-primary/30";
                    textColor = "text-primary";
                  }
                  if (isUserSelected && !isCorrectOption) {
                    bg = "bg-destructive/10";
                    border = "border-destructive/30";
                    textColor = "text-destructive";
                  }

                  return (
                    <div
                      key={oi}
                      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${bg} ${border}`}
                    >
                      <span className="font-mono font-bold text-muted-foreground">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className={textColor}>{String(opt)}</span>
                      {isCorrectOption && (
                        <CheckCircle className="ml-auto h-3 w-3 text-primary" />
                      )}
                      {isUserSelected && !isCorrectOption && (
                        <XCircle className="ml-auto h-3 w-3 text-destructive" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Explanation */}
            {q.explanation && (
              <p className="ml-12 mt-2 text-xs italic text-muted-foreground">
                💡 {q.explanation}
              </p>
            )}

            {/* Points (for arena answers) */}
            {answer?.points !== undefined && (
              <p className="ml-12 mt-1 text-xs text-muted-foreground">
                +{answer.points} pts
                {answer.time_taken_ms !== undefined && (
                  <> · {(answer.time_taken_ms / 1000).toFixed(1)}s</>
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuestionReview;
