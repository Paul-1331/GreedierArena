import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Clock, CheckCircle, XCircle, Trophy, ArrowRight, RotateCcw, LogIn, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

type Phase = "intro" | "playing" | "results";

const optionLabels = ["A", "B", "C", "D"];

// Helper to extract correct answer info
const getQuestionType = (q: { question_type?: string }): string => {
  const t = (q as any).question_type || "single_mcq";
  // Normalize multi_mcq to multi_select for consistent handling
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

const isAnswerCorrect = (
  questionType: string,
  correctAnswer: number | number[],
  userAnswer: number | number[] | string
): boolean => {
  if (questionType === "single_mcq") return userAnswer === correctAnswer;
  if (questionType === "multi_select") {
    const correct = (correctAnswer as number[]).slice().sort((a, b) => a - b);
    const selected = (userAnswer as number[]).slice().sort((a, b) => a - b);
    return correct.length === selected.length && correct.every((v, i) => v === selected[i]);
  }
  if (questionType === "numeric") return Number(userAnswer) === Number(correctAnswer);
  return false;
};

const PlayQuiz = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([]);
  const [numericInput, setNumericInput] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [answers, setAnswers] = useState<{ questionId: string; selected: any; correct: any; isCorrect: boolean }[]>([]);
  const [timeLeft, setTimeLeft] = useState(30);

  const { data: quiz, isLoading: loadingQuiz } = useQuery({
    queryKey: ["play-quiz", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("*")
        .eq("slug", slug!)
        .eq("status", "approved")
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const quizId = quiz?.id;

  const { data: questions, isLoading: loadingQuestions } = useQuery({
    queryKey: ["play-quiz-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!quizId,
  });

  const saveAttempt = useMutation({
    mutationFn: async (score: number) => {
      if (!user || !questions) return;
      const { error } = await supabase.from("quiz_attempts").insert({
        quiz_id: quizId!,
        user_id: user.id,
        score,
        total_questions: questions.length,
        answers: answers as unknown as Json,
        completed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onError: () => toast.error("Failed to save your score."),
  });

  const currentQuestion = questions?.[currentIndex];
  const currentType = currentQuestion ? getQuestionType(currentQuestion) : "single_mcq";
  const currentCorrect = currentQuestion ? getCorrectAnswer(currentQuestion, currentType) : 0;
  const score = answers.filter((a) => a.isCorrect).length;
  const totalQuestions = questions?.length ?? 0;

  const questionTimeLimit = quiz?.time_limit_seconds ?? 30;

  const handleSubmitAnswer = useCallback(() => {
    if (showAnswer || !currentQuestion) return;
    setShowAnswer(true);

    const type = getQuestionType(currentQuestion);
    const correct = getCorrectAnswer(currentQuestion, type);
    let userAnswer: any;

    if (type === "single_mcq") userAnswer = selectedAnswer ?? -1;
    else if (type === "multi_select") userAnswer = selectedMulti;
    else userAnswer = numericInput;

    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selected: userAnswer,
        correct,
        isCorrect: isAnswerCorrect(type, correct, userAnswer),
      },
    ]);
  }, [showAnswer, currentQuestion, selectedAnswer, selectedMulti, numericInput]);

  // Timer — use ref to avoid stale closure on handleSubmitAnswer
  const handleSubmitRef = useRef(handleSubmitAnswer);
  handleSubmitRef.current = handleSubmitAnswer;

  useEffect(() => {
    if (phase !== "playing" || showAnswer) return;
    setTimeLeft(questionTimeLimit);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, currentIndex, showAnswer, questionTimeLimit]);

  const handleNext = () => {
    if (currentIndex + 1 >= totalQuestions) {
      setPhase("results");
      const finalScore = answers.filter((a) => a.isCorrect).length;
      saveAttempt.mutate(finalScore);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setSelectedMulti([]);
      setNumericInput("");
      setShowAnswer(false);
    }
  };

  const isLoading = loadingQuiz || loadingQuestions;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!quiz || !questions || questions.length === 0) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg text-muted-foreground">Quiz not found or has no questions.</p>
          <Button onClick={() => navigate("/explore")}>Back to Explore</Button>
        </div>
      </Layout>
    );
  }

  // --- INTRO ---
  if (phase === "intro") {
    return (
      <Layout>
        <div className="container mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
            <Badge variant="secondary" className="text-sm">{quiz.category}</Badge>
            <h1 className="font-display text-3xl font-bold text-foreground">{quiz.title}</h1>
            {quiz.description && <p className="text-muted-foreground">{quiz.description}</p>}
            <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
              <span>{questions.length} questions</span>
              <span>·</span>
              <span className="capitalize">{quiz.difficulty}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {quiz.time_limit_seconds ?? 30}s per question</span>
            </div>
            <Button size="lg" onClick={() => setPhase("playing")} className="gap-2 font-body">
              Start Quiz <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // --- RESULTS ---
  if (phase === "results") {
    const percentage = Math.round((score / totalQuestions) * 100);
    const grade = percentage >= 80 ? "Excellent!" : percentage >= 50 ? "Good job!" : "Keep practicing!";
    return (
      <Layout>
        <div className="container mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full space-y-6">
            <Trophy className={`mx-auto h-16 w-16 ${percentage >= 80 ? "text-primary" : percentage >= 50 ? "text-accent" : "text-muted-foreground"}`} />
            <h1 className="font-display text-3xl font-bold text-foreground">{grade}</h1>
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="text-4xl font-bold text-foreground">{score}/{totalQuestions}</p>
              <p className="mt-1 text-sm text-muted-foreground">{percentage}% correct</p>
              <Progress value={percentage} className="mt-4" />
            </div>

            {/* Answer review */}
            <div className="space-y-3 text-left">
              <h3 className="font-display text-sm font-semibold text-muted-foreground">Review</h3>
              {questions.map((q, i) => {
                const answer = answers[i];
                const qType = getQuestionType(q);
                const correct = getCorrectAnswer(q, qType);
                const options = (q.options as Json[]) as string[];
                const wasCorrect = answer?.isCorrect;

                return (
                  <div key={q.id} className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-2 flex items-start gap-2">
                      {wasCorrect ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                    </div>
                    {!wasCorrect && (
                      <p className="ml-6 text-xs text-muted-foreground">
                        {qType === "single_mcq" && (
                          <>
                            Correct: <span className="font-medium text-primary">{options[correct as number]}</span>
                            {answer?.selected >= 0 && (
                              <> · Your answer: <span className="text-destructive">{options[answer.selected]}</span></>
                            )}
                          </>
                        )}
                        {qType === "multi_select" && (
                          <>
                            Correct: <span className="font-medium text-primary">{(correct as number[]).map((ci) => options[ci]).join(", ")}</span>
                            {answer && (
                              <> · Your answer: <span className="text-destructive">{(answer.selected as number[]).map((si: number) => options[si]).join(", ") || "None"}</span></>
                            )}
                          </>
                        )}
                        {qType === "numeric" && (
                          <>
                            Correct: <span className="font-medium text-primary">{String(correct)}</span>
                            {answer && (
                              <> · Your answer: <span className="text-destructive">{String(answer.selected) || "No answer"}</span></>
                            )}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sign-in prompt for anonymous users */}
            {!user && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <LogIn className="h-4 w-4 text-primary" />
                  Sign in to save your score
                </div>
                <p className="text-xs text-muted-foreground">
                  Your score won't be saved unless you sign in. Sign in with Google to track your progress and compete on leaderboards.
                </p>
                <Button onClick={signInWithGoogle} size="sm" className="w-full gap-2 font-body">
                  Sign in with Google
                </Button>
              </motion.div>
            )}

            {user && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-primary" /> Score saved to your profile
              </p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/explore")} className="flex-1 font-body">
                Back to Explore
              </Button>
              <Button
                onClick={() => {
                  setPhase("intro");
                  setCurrentIndex(0);
                  setSelectedAnswer(null);
                  setSelectedMulti([]);
                  setNumericInput("");
                  setShowAnswer(false);
                  setAnswers([]);
                }}
                className="flex-1 gap-2 font-body"
              >
                <RotateCcw className="h-4 w-4" /> Retry
              </Button>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // --- PLAYING ---
  const options = currentQuestion ? ((currentQuestion.options as Json[]) as string[]) : [];

  return (
    <Layout>
      <div className="container mx-auto max-w-lg px-4 py-10">
        {/* Header: counter, timer, exit */}
        <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>Question {currentIndex + 1}/{totalQuestions}</span>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1 font-medium ${timeLeft <= 5 ? "text-destructive" : ""}`}>
              <Clock className="h-3.5 w-3.5" /> {timeLeft}s
            </span>
            <button
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Exit quiz"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {/* Question */}
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs capitalize">{currentType.replace("_", " ")}</Badge>
              </div>
              <p className="font-display text-lg font-semibold text-foreground">
                {currentQuestion?.question_text}
              </p>
              {currentType === "multi_select" && (
                <p className="mt-1 text-xs text-muted-foreground">Select all correct answers</p>
              )}
            </div>

            {/* Single MCQ Options */}
            {currentType === "single_mcq" && (
              <div className="grid gap-3">
                {options.map((opt, oi) => {
                  const isSelected = selectedAnswer === oi;
                  const isCorrect = (currentCorrect as number) === oi;
                  let style = isSelected
                    ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/30"
                    : "border-border bg-card hover:bg-muted/50 text-foreground";

                  if (showAnswer) {
                    if (isCorrect) style = "border-primary bg-primary/10 text-foreground";
                    else if (isSelected && !isCorrect) style = "border-destructive bg-destructive/10 text-foreground";
                    else style = "border-border bg-card text-muted-foreground opacity-60";
                  }

                  return (
                    <button
                      key={oi}
                      onClick={() => { setSelectedAnswer(oi); }}
                      disabled={showAnswer}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-body transition-all ${style} ${!showAnswer ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        showAnswer && isCorrect ? "bg-primary text-primary-foreground"
                          : showAnswer && isSelected && !isCorrect ? "bg-destructive text-destructive-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>{optionLabels[oi]}</span>
                      <span className="flex-1">{String(opt)}</span>
                      {showAnswer && isCorrect && <CheckCircle className="h-5 w-5 shrink-0 text-primary" />}
                      {showAnswer && isSelected && !isCorrect && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Multi-select Options */}
            {currentType === "multi_select" && (
              <div className="grid gap-3">
                {options.map((opt, oi) => {
                  const isSelected = selectedMulti.includes(oi);
                  const isCorrect = (currentCorrect as number[]).includes(oi);
                  let style = "border-border bg-card hover:bg-muted/50 text-foreground";

                  if (showAnswer) {
                    if (isCorrect) style = "border-primary bg-primary/10 text-foreground";
                    else if (isSelected && !isCorrect) style = "border-destructive bg-destructive/10 text-foreground";
                    else style = "border-border bg-card text-muted-foreground opacity-60";
                  }

                  return (
                    <button
                      key={oi}
                      onClick={() => {
                        if (showAnswer) return;
                        setSelectedMulti((prev) =>
                          prev.includes(oi) ? prev.filter((i) => i !== oi) : [...prev, oi]
                        );
                      }}
                      disabled={showAnswer}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-body transition-all ${style} ${!showAnswer ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <Checkbox checked={isSelected} className="shrink-0 pointer-events-none" />
                      <span className="flex-1">{String(opt)}</span>
                      {showAnswer && isCorrect && <CheckCircle className="h-5 w-5 shrink-0 text-primary" />}
                      {showAnswer && isSelected && !isCorrect && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Numeric Input */}
            {currentType === "numeric" && (
              <div className="rounded-lg border border-border bg-card p-6">
                <Input
                  type="number"
                  value={numericInput}
                  onChange={(e) => !showAnswer && setNumericInput(e.target.value)}
                  placeholder="Enter your answer..."
                  className="font-body text-lg"
                  disabled={showAnswer}
                  autoFocus
                />
                {showAnswer && (
                  <p className="mt-3 text-sm">
                    {isAnswerCorrect("numeric", currentCorrect, numericInput) ? (
                      <span className="flex items-center gap-1 text-primary"><CheckCircle className="h-4 w-4" /> Correct!</span>
                    ) : (
                      <span className="text-destructive">
                        Incorrect. The answer is <span className="font-medium">{String(currentCorrect)}</span>
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Submit button for multi-select and numeric */}
            {!showAnswer && (currentType === "multi_select" || currentType === "numeric" || currentType === "single_mcq") && currentType !== "single_mcq" && (
              <Button onClick={handleSubmitAnswer} size="lg" className="w-full gap-2 font-body">
                Submit Answer
              </Button>
            )}

            {/* Auto-submit for single MCQ on click */}
            {!showAnswer && currentType === "single_mcq" && selectedAnswer !== null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Button onClick={handleSubmitAnswer} size="lg" className="w-full gap-2 font-body">
                  Confirm Answer
                </Button>
              </motion.div>
            )}

            {/* Explanation */}
            {showAnswer && currentQuestion?.explanation && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground italic"
              >
                {currentQuestion.explanation}
              </motion.p>
            )}

            {/* Next button */}
            {showAnswer && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Button onClick={handleNext} size="lg" className="w-full gap-2 font-body">
                  {currentIndex + 1 >= totalQuestions ? "See Results" : "Next Question"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Layout>
  );
};

export default PlayQuiz;
