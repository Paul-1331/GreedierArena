import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Clock, Trophy, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const optionLabels = ["A", "B", "C", "D"];
const DEFAULT_QUESTION_TIME_SECONDS = 30;
const COUNTDOWN_DURATION_SECONDS = 3;

const calculatePoints = (isCorrect: boolean, timeTakenMs: number, maxTimeMs: number) => {
  if (!isCorrect) return 0;
  const speedRatio = Math.max(0, 1 - timeTakenMs / maxTimeMs);
  return Math.round(10 + speedRatio * 10);
};

interface AnswerRecord {
  question_id: string;
  selected: number | number[] | string;
  is_correct: boolean;
  time_taken_ms: number;
  points: number;
}

const ArenaPlay = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── CORE UI STATE ───
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<number[]>([]);
  const [numericInput, setNumericInput] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(DEFAULT_QUESTION_TIME_SECONDS);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [myAnswers, setMyAnswers] = useState<AnswerRecord[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [globalTimeLeft, setGlobalTimeLeft] = useState<number | null>(null);
  const globalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [finished, setFinished] = useState(false);
  const [restored, setRestored] = useState(false);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── GUARDS to prevent duplicate auto-submits and double timer starts ───
  const autoSubmittedForIndexRef = useRef<number | null>(null);
  const countdownRanRef = useRef(false);

  // Warn before leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!finished) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [finished]);

  // ─── DATA QUERIES ───
  const { data: match } = useQuery({
    queryKey: ["arena-match-play", matchId],
    queryFn: async () => {
      await supabase.rpc("process_due_wars");

      const { data, error } = await supabase
        .from("arena_matches")
        .select(`*, quizzes (id, title, time_limit_seconds)`)
        .eq("id", matchId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 3000,
  });

  const { data: questions } = useQuery({
    queryKey: ["arena-questions", match?.quiz_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", match!.quiz_id)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!match?.quiz_id,
  });

  const { data: participants } = useQuery({
    queryKey: ["arena-leaderboard", matchId],
    queryFn: async () => {
      const { data: participantsData, error: pError } = await supabase
        .from("arena_participants")
        .select("id, user_id, score, total_time_ms, answers")
        .eq("match_id", matchId!)
        .order("score", { ascending: false });
      if (pError) throw pError;
      if (!participantsData?.length) return [];
      const userIds = participantsData.map((p) => p.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      const profileMap = new Map(profilesData?.map((p) => [p.user_id, p]) ?? []);
      return participantsData.map((p) => ({
        ...p,
        display_name: profileMap.get(p.user_id)?.display_name ?? "Player",
      }));
    },
    enabled: !!matchId,
    refetchInterval: 2000,
  });

  const questionTimeSeconds = (match?.quizzes as any)?.time_limit_seconds ?? DEFAULT_QUESTION_TIME_SECONDS;
  const isOfficial = !!match?.is_official;
  const totalQuestions = questions?.length ?? 0;
  const globalTimeTotal = totalQuestions * questionTimeSeconds;

  // ─── Question readiness guards ───
  const hasQuestionsLoaded = !!questions;
  const hasPlayableQuestions = totalQuestions > 0;

  // ─── HELPER: compute global time remaining from server ───
  const computeGlobalTimeRemaining = useCallback(() => {
    if (!match?.started_at) return globalTimeTotal;
    const countdownOffsetMs = isOfficial ? 0 : COUNTDOWN_DURATION_SECONDS * 1000;
    const effectiveStart = new Date(match.started_at).getTime() + countdownOffsetMs;
    const elapsed = (Date.now() - effectiveStart) / 1000;
    return Math.max(0, globalTimeTotal - elapsed);
  }, [match?.started_at, globalTimeTotal, isOfficial]);

  // ═══════════════════════════════════════════════════
  // FIX 1: Navigate via useEffect, NEVER during render
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (!matchId || !match) return;
    if (match.status === "finished") {
      navigate(`/arena/${matchId}/results`, { replace: true });
    }
  }, [matchId, match?.status, navigate]);

  // ═══════════════════════════════════════════════════
  // SESSION RESTORE (participant-authoritative)
  // Restores exactly to participant's current question and remaining time
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (!match || !questions || !user || restored) return;
    if (match.status !== "playing") return;

    // Skip countdown for rejoin — match is already playing
    countdownRanRef.current = true;

    const restoreFromDB = async () => {
      try {
        const { data: myParticipant, error } = await supabase
          .from("arena_participants")
          .select("answers, score, total_time_ms, current_question_index, player_phase, question_started_at")
          .eq("match_id", matchId!)
          .eq("user_id", user.id)
          .single();

        if (error || !myParticipant) {
          console.error("Failed to load participant data:", error);
          navigate(`/arena`, { replace: true });
          return;
        }

        const savedAnswers = (myParticipant.answers as unknown as AnswerRecord[]) ?? [];
        const savedScore = myParticipant.score ?? 0;
        const playerPhase = (myParticipant as { player_phase?: string }).player_phase ?? "answering";
        const participantIndex = Math.min(
          Math.max((myParticipant.current_question_index ?? 0), 0),
          Math.max(totalQuestions - 1, 0)
        );
        const globalRemaining = computeGlobalTimeRemaining();

        setGlobalTimeLeft(Math.ceil(globalRemaining));
        setMyAnswers(savedAnswers);
        setMyScore(savedScore);

        // Player already finished
        if (globalRemaining <= 0 || playerPhase === "finished" || savedAnswers.length >= totalQuestions) {
          setFinished(true);
          setRestored(true);
          return;
        }

        if (!totalQuestions) {
          setRestored(true);
          return;
        }

        setCurrentIndex(participantIndex);

        if (playerPhase === "revealed") {
          setShowAnswer(true);
          setQuestionTimeLeft(0);
          autoSubmittedForIndexRef.current = participantIndex;
        } else {
          const participantQuestionStartedAt = myParticipant.question_started_at
            ? new Date(myParticipant.question_started_at).getTime()
            : match.question_started_at
              ? new Date(match.question_started_at).getTime()
              : Date.now();

          const elapsedMs = Math.max(0, Date.now() - participantQuestionStartedAt);
          const remainingSec = Math.max(0, Math.ceil(questionTimeSeconds - elapsedMs / 1000));

          setShowAnswer(false);
          setQuestionStartTime(participantQuestionStartedAt);
          setQuestionTimeLeft(remainingSec);
          autoSubmittedForIndexRef.current = null;
        }
      } catch (err) {
        console.error("Restoration error:", err);
        setGlobalTimeLeft(Math.ceil(computeGlobalTimeRemaining()));
      }
      setRestored(true);
    };

    restoreFromDB();
  }, [match, questions, user, matchId, restored, computeGlobalTimeRemaining, questionTimeSeconds, totalQuestions, globalTimeTotal, navigate]);

  // ─── Realtime: match finish ───
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`arena-play-${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "arena_matches", filter: `id=eq.${matchId}` }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["arena-match-play", matchId] });
        if ((payload.new as any).status === "finished") {
          // Navigation handled by the useEffect above watching match.status
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, queryClient]);

  // ─── COUNTDOWN (fresh start only, not rejoin) ───
  useEffect(() => {
    if (!match || countdownRanRef.current) return;
    if (match.status !== "countdown" && match.status !== "playing") return;

    countdownRanRef.current = true;

    // If already playing, skip countdown entirely
    if (match.status === "playing") return;

    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        // Host transitions to playing
        if (match.host_id === user?.id) {
          supabase
            .from("arena_matches")
            .update({ status: "playing", started_at: new Date().toISOString(), question_started_at: new Date().toISOString() })
            .eq("id", matchId!)
            .then(({ error }) => { if (error) console.error("Failed to transition:", error); });
        }
        return;
      }
      setCountdown(count);
    }, 1000);
    return () => clearInterval(interval);
  }, [match?.status, match?.host_id, user?.id, matchId]);

  // Fallback: if countdown finished but match stuck in "countdown" after 5s
  useEffect(() => {
    if (!match || match.status !== "countdown" || countdown !== null) return;
    if (!countdownRanRef.current) return;
    const timeout = setTimeout(() => {
      supabase
        .from("arena_matches")
        .update({ status: "playing", started_at: new Date().toISOString(), question_started_at: new Date().toISOString() })
        .eq("id", matchId!)
        .eq("status", "countdown");
    }, 5000);
    return () => clearTimeout(timeout);
  }, [match?.status, countdown, matchId]);

  const currentQuestion = questions?.[currentIndex];

  const getQuestionType = (q: any): string => q?.question_type || "single_mcq";
  const getCorrectAnswer = (q: any): number | number[] => {
    const ca = q?.correct_answer;
    if (Array.isArray(ca)) return ca as number[];
    if (typeof ca === "number") return ca;
    return 0;
  };

  const isAnswerCorrect = (questionType: string, correctAnswer: number | number[], userAnswer: number | number[] | string): boolean => {
    if (questionType === "single_mcq") return userAnswer === correctAnswer;
    if (questionType === "multi_select") {
      const correct = (correctAnswer as number[]).slice().sort();
      const selected = (userAnswer as number[]).slice().sort();
      return correct.length === selected.length && correct.every((v, i) => v === selected[i]);
    }
    if (questionType === "numeric") return Number(userAnswer) === Number(correctAnswer);
    return false;
  };

  const resetForNewQuestion = useCallback(() => {
    setSelectedAnswer(null);
    setSelectedMulti([]);
    setNumericInput("");
    setShowAnswer(false);
    setQuestionTimeLeft(questionTimeSeconds);
    setQuestionStartTime(Date.now());
    autoSubmittedForIndexRef.current = null;
  }, [questionTimeSeconds]);

  // ─── GLOBAL TIMER INIT (fresh start only) ───
  useEffect(() => {
    if (restored || globalTimeLeft !== null || finished) return;
    if (countdown !== null || !match?.started_at) return;
    if (!countdownRanRef.current) return;

    // Critical guard: do not initialize timer before questions are loaded
    if (!hasQuestionsLoaded || !hasPlayableQuestions) return;

    const remaining = computeGlobalTimeRemaining();
    setGlobalTimeLeft(Math.ceil(remaining));
  }, [
    countdown,
    match?.started_at,
    restored,
    globalTimeLeft,
    finished,
    computeGlobalTimeRemaining,
    hasQuestionsLoaded,
    hasPlayableQuestions,
  ]);

  // Global timer tick
  useEffect(() => {
    if (globalTimeLeft === null || globalTimeLeft <= 0 || finished) return;
    globalTimerRef.current = setInterval(() => {
      setGlobalTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (globalTimerRef.current) clearInterval(globalTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (globalTimerRef.current) clearInterval(globalTimerRef.current); };
  }, [globalTimeLeft !== null && globalTimeLeft > 0 && !finished]);

  const handleSubmitRef = useRef<() => void>(() => {});

  // Global timer expiry → auto-finish
  useEffect(() => {
    if (globalTimeLeft !== 0 || finished) return;

    // Critical guard: ignore zero-time expiry until session is fully restored
    // and questions are definitely available
    if (!restored) return;
    if (!hasQuestionsLoaded || !hasPlayableQuestions) return;

    if (!showAnswer) handleSubmitRef.current();
    setFinished(true);
    // Write finished phase to DB
    supabase
      .from("arena_participants")
      .update({ player_phase: "finished", finished_at: new Date().toISOString() })
      .eq("match_id", matchId!)
      .eq("user_id", user?.id ?? "");
    if (match?.host_id === user?.id) {
      supabase
        .from("arena_matches")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", matchId!);
    }
  }, [
    globalTimeLeft,
    finished,
    restored,
    hasQuestionsLoaded,
    hasPlayableQuestions,
    showAnswer,
    matchId,
    user?.id,
    match?.host_id,
  ]);

  // ═══════════════════════════════════════════════════
  // Question timer (participant question_started_at authoritative)
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (!restored && countdown !== null) return;
    if (showAnswer || !currentQuestion || finished) return;
    if (match?.status !== "playing") return;

    // Official wars run on global timer only (no per-question timeout).
    if (isOfficial) return;

    if (questionTimerRef.current) clearInterval(questionTimerRef.current);

    const questionWindowEnd = questionStartTime + questionTimeSeconds * 1000;

    const tick = () => {
      const remainingSec = Math.max(0, Math.ceil((questionWindowEnd - Date.now()) / 1000));
      setQuestionTimeLeft(remainingSec);

      if (remainingSec <= 0) {
        if (questionTimerRef.current) clearInterval(questionTimerRef.current);
        // Guard: only auto-submit once per question index
        if (autoSubmittedForIndexRef.current !== currentIndex) {
          autoSubmittedForIndexRef.current = currentIndex;
          handleSubmitRef.current();
        }
      }
    };

    tick();
    questionTimerRef.current = setInterval(tick, 250);

    return () => { if (questionTimerRef.current) clearInterval(questionTimerRef.current); };
  }, [currentIndex, showAnswer, finished, currentQuestion, restored, match?.status, countdown, questionTimeSeconds, questionStartTime, isOfficial]);

  // ═══════════════════════════════════════════════════
  // FIX 5: Atomic DB writes with player_phase
  // ═══════════════════════════════════════════════════
  const submitAnswer = useMutation({
    mutationFn: async (answerData: { score: number; totalTimeMs: number; answers: AnswerRecord[]; currentIndex: number }) => {
      // On submit: write answers + player_phase = 'revealed'
      const { error } = await supabase
        .from("arena_participants")
        .update({
          score: answerData.score,
          total_time_ms: answerData.totalTimeMs,
          answers: answerData.answers as unknown as Json,
          current_question_index: answerData.currentIndex,
          player_phase: "revealed",
        })
        .eq("match_id", matchId!)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmitAnswer = useCallback(() => {
    if (showAnswer || !currentQuestion) return;
    setShowAnswer(true);

    const timeTakenMs = Date.now() - questionStartTime;
    const type = getQuestionType(currentQuestion);
    const correct = getCorrectAnswer(currentQuestion);

    let userAnswer: number | number[] | string;
    if (type === "single_mcq") userAnswer = selectedAnswer ?? -1;
    else if (type === "multi_select") userAnswer = selectedMulti;
    else userAnswer = numericInput;

    const isCorrect = isAnswerCorrect(type, correct, userAnswer);
    const points = calculatePoints(isCorrect, timeTakenMs, questionTimeSeconds * 1000);

    const newAnswer: AnswerRecord = {
      question_id: currentQuestion.id,
      selected: userAnswer,
      is_correct: isCorrect,
      time_taken_ms: timeTakenMs,
      points,
    };

    const updatedAnswers = [...myAnswers, newAnswer];
    const newScore = myScore + points;
    const totalTimeMs = updatedAnswers.reduce((sum, a) => sum + a.time_taken_ms, 0);

    setMyAnswers(updatedAnswers);
    setMyScore(newScore);

    // FIX 5: Atomic write with player_phase = 'revealed'
    submitAnswer.mutate({ score: newScore, totalTimeMs, answers: updatedAnswers, currentIndex });
  }, [showAnswer, currentQuestion, selectedAnswer, selectedMulti, numericInput, questionStartTime, myAnswers, myScore, questionTimeSeconds, currentIndex]);
  handleSubmitRef.current = handleSubmitAnswer;

  // Poll to check if all participants finished (host only)
  useEffect(() => {
    if (!finished || !matchId || match?.status === "finished" || match?.host_id !== user?.id) return;

    const checkAllDone = async () => {
      const { data: allParticipants } = await supabase
        .from("arena_participants")
        .select("answers")
        .eq("match_id", matchId);

      const allDone = allParticipants?.every((p) => {
        const answers = p.answers as any[];
        return answers && answers.length >= totalQuestions;
      });

      if (allDone) {
        await supabase
          .from("arena_matches")
          .update({ status: "finished", finished_at: new Date().toISOString() })
          .eq("id", matchId);
      }
    };

    checkAllDone();
    const interval = setInterval(checkAllDone, 3000);
    return () => clearInterval(interval);
  }, [finished, matchId, match?.status, match?.host_id, user?.id, totalQuestions]);

  // Handle next question (no auto-skip on expired next questions)
  const handleNext = async () => {
    if (currentIndex + 1 >= totalQuestions) {
      setFinished(true);
      await supabase
        .from("arena_participants")
        .update({ finished_at: new Date().toISOString(), player_phase: "finished" })
        .eq("match_id", matchId!)
        .eq("user_id", user!.id);
    } else {
      const nextIndex = currentIndex + 1;

      setCurrentIndex(nextIndex);
      resetForNewQuestion();

      // Atomic DB write: next question index + phase + timestamp
      await supabase
        .from("arena_participants")
        .update({
          question_started_at: new Date().toISOString(),
          current_question_index: nextIndex,
          player_phase: "answering",
        })
        .eq("match_id", matchId!)
        .eq("user_id", user!.id);
    }
  };

  const toggleMultiSelect = (index: number) => {
    setSelectedMulti((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // ─── RENDER GATES (no navigate calls here!) ───

  // Loading: no data yet
  if (!match || !questions) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // Defensive: empty questions gate
  if (questions && questions.length === 0) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">No Questions Found</h2>
          <p className="text-sm text-muted-foreground">
            This match cannot start because the quiz returned zero playable questions.
          </p>
          <Button onClick={() => navigate("/arena")} variant="outline">
            Back to Arena
          </Button>
        </div>
      </Layout>
    );
  }

  // Match already finished — useEffect will navigate, just show loader
  if (match.status === "finished") {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // Show loading while restoring session
  if (match.status === "playing" && !restored) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Restoring your session...</p>
        </div>
      </Layout>
    );
  }

  // Countdown screen
  if (countdown !== null) {
    return (
      <Layout>
        <div className="flex min-h-[70vh] flex-col items-center justify-center">
          <motion.div
            key={countdown}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="font-display text-9xl font-bold text-primary"
          >
            {countdown}
          </motion.div>
        </div>
      </Layout>
    );
  }

  // Finished waiting screen
  if (finished) {
    return (
      <Layout>
        <div className="container mx-auto max-w-4xl px-4 py-6">
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
            <Trophy className="h-12 w-12 text-primary" />
            <h2 className="font-display text-2xl font-bold text-foreground">You're done!</h2>
            <p className="text-muted-foreground">Waiting for other players to finish...</p>
            <p className="font-display text-3xl font-bold text-primary">{myScore} points</p>
          </div>
          <div className="mx-auto mt-6 max-w-sm rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-semibold text-foreground">Live Scores</h3>
            </div>
            <LeaderboardList participants={participants} userId={user?.id} />
          </div>
        </div>
      </Layout>
    );
  }

  const questionType = getQuestionType(currentQuestion);
  const correctAnswer = getCorrectAnswer(currentQuestion);
  const options = (currentQuestion?.options as string[]) ?? [];

  return (
    <Layout>
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Quiz Area */}
          <div className="lg:col-span-2 space-y-4">
            {globalTimeLeft !== null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Overall Time</span>
                  <span className={`font-mono font-semibold ${globalTimeLeft <= 30 ? "text-destructive" : ""}`}>
                    {Math.floor(globalTimeLeft / 60)}:{String(globalTimeLeft % 60).padStart(2, "0")}
                  </span>
                </div>
                <Progress value={(globalTimeLeft / globalTimeTotal) * 100} className="h-1.5 transition-none" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              {!isOfficial && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className={`font-mono text-lg font-bold ${questionTimeLeft <= 5 ? "text-destructive" : "text-foreground"}`}>
                    {questionTimeLeft}s
                  </span>
                </div>
              )}
            </div>

            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-xl border border-border bg-card p-6"
            >
              <h2 className="mb-6 font-display text-xl font-semibold text-foreground">
                {currentQuestion?.question_text}
              </h2>

              {questionType === "single_mcq" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {options.map((option, idx) => {
                    const isSelected = selectedAnswer === idx;
                    const isCorrectOption = idx === correctAnswer;
                    let optionClass = "border-border bg-background hover:border-primary/50";
                    if (showAnswer) {
                      if (isCorrectOption) optionClass = "border-primary bg-primary/10";
                      else if (isSelected && !isCorrectOption) optionClass = "border-destructive bg-destructive/10";
                    } else if (isSelected) {
                      optionClass = "border-primary bg-primary/5";
                    }
                    return (
                      <button key={idx} onClick={() => !showAnswer && setSelectedAnswer(idx)} disabled={showAnswer}
                        className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${optionClass}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">{optionLabels[idx]}</span>
                        <span className="font-body text-foreground">{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {questionType === "multi_select" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {options.map((option, idx) => {
                    const isSelected = selectedMulti.includes(idx);
                    const isCorrectOption = (correctAnswer as number[]).includes(idx);
                    let optionClass = "border-border bg-background";
                    if (showAnswer) {
                      if (isCorrectOption) optionClass = "border-primary bg-primary/10";
                      else if (isSelected && !isCorrectOption) optionClass = "border-destructive bg-destructive/10";
                    } else if (isSelected) {
                      optionClass = "border-primary bg-primary/5";
                    }
                    return (
                      <button key={idx} onClick={() => !showAnswer && toggleMultiSelect(idx)} disabled={showAnswer}
                        className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${optionClass}`}>
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                        <span className="font-body text-foreground">{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {questionType === "numeric" && (
                <div className="max-w-xs">
                  <Input type="number" value={numericInput} onChange={(e) => !showAnswer && setNumericInput(e.target.value)}
                    placeholder="Enter your answer" disabled={showAnswer} className="font-mono text-lg" />
                  {showAnswer && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Correct answer: <span className="font-semibold text-primary">{correctAnswer}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                {!showAnswer ? (
                  <Button onClick={handleSubmitAnswer} size="lg">Submit Answer</Button>
                ) : (
                  <Button onClick={handleNext} size="lg">
                    {currentIndex + 1 >= totalQuestions ? "See Results" : "Next Question"}
                  </Button>
                )}
              </div>
            </motion.div>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">Your Score</span>
              <span className="font-display text-2xl font-bold text-primary">{myScore}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-semibold text-foreground">Live Scores</h3>
            </div>
            <LeaderboardList participants={participants} userId={user?.id} />
          </div>
        </div>
      </div>
    </Layout>
  );
};

const LeaderboardList = ({ participants, userId }: { participants: any[] | undefined; userId: string | undefined }) => (
  <div className="space-y-2">
    <AnimatePresence>
      {participants?.map((p, idx) => (
        <motion.div key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`flex items-center justify-between rounded-md px-3 py-2 ${p.user_id === userId ? "bg-primary/10" : "bg-muted/50"}`}>
          <div className="flex items-center gap-2">
            <span className="w-5 text-center text-sm font-bold text-muted-foreground">
              {idx === 0 ? <Crown className="h-4 w-4 text-primary" /> : idx + 1}
            </span>
            <span className="font-body text-sm text-foreground">{p.display_name}{p.user_id === userId && " (you)"}</span>
          </div>
          <span className="font-mono text-sm font-semibold text-foreground">{p.score}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

export default ArenaPlay;
