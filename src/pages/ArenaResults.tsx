import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Trophy, Medal, Home, RotateCcw, TrendingUp, TrendingDown, Crown, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { computeMatchRatings, type GlickoPlayer } from "@/lib/glicko2";
import { useEffect, useRef, useState } from "react";
import QuestionReview from "@/components/QuestionReview";

const ArenaResults = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ratingsUpdatedRef = useRef(false);
  const [showReview, setShowReview] = useState(false);

  // Fetch match details
  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ["arena-results-match", matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arena_matches")
        .select(`*, quizzes (title, category)`)
        .eq("id", matchId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
  });

  // Fetch final standings
  const { data: standings, isLoading: loadingStandings } = useQuery({
    queryKey: ["arena-results-standings", matchId],
    queryFn: async () => {
      const { data: participantsData, error: pError } = await supabase
        .from("arena_participants")
        .select("id, user_id, score, total_time_ms, answers")
        .eq("match_id", matchId!)
        .order("score", { ascending: false })
        .order("total_time_ms", { ascending: true });

      if (pError) throw pError;
      if (!participantsData?.length) return [];

      const activePlayers = participantsData.filter((p) => {
        const answers = p.answers as any[];
        return answers && answers.length > 0;
      });

      if (!activePlayers.length) return [];

      const userIds = activePlayers.map((p) => p.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profilesData?.map((p) => [p.user_id, p]) ?? []);
      return activePlayers.map((p, idx) => ({
        ...p,
        rank: idx + 1,
        display_name: profileMap.get(p.user_id)?.display_name ?? "Player",
        avatar_url: profileMap.get(p.user_id)?.avatar_url,
      }));
    },
    enabled: !!matchId,
  });

  // Fetch rating changes for official matches
  const { data: ratingChanges } = useQuery({
    queryKey: ["arena-rating-changes", matchId],
    queryFn: async () => {
      if (!match?.is_official || !standings?.length) return null;

      const userIds = standings.map((s) => s.user_id);
      const { data: ratings } = await supabase
        .from("arena_ratings")
        .select("user_id, rating, deviation, volatility")
        .in("user_id", userIds);

      return new Map(ratings?.map((r) => [r.user_id, r]) ?? []);
    },
    enabled: !!match?.is_official && !!standings?.length,
  });

  // Update Glicko-2 ratings for official matches (run once per match per user session)
  useEffect(() => {
    if (
      ratingsUpdatedRef.current ||
      !match?.is_official ||
      !standings?.length ||
      standings.length < 2 ||
      !user
    ) return;

    ratingsUpdatedRef.current = true;

    const updateRatings = async () => {
      try {
        const userIds = standings.map((s) => s.user_id);

        // Fetch current ratings
        const { data: existingRatings } = await supabase
          .from("arena_ratings")
          .select("user_id, rating, deviation, volatility, matches_played, wins, total_score")
          .in("user_id", userIds);

        const ratingMap = new Map(existingRatings?.map((r) => [r.user_id, r]) ?? []);

        // Build participants for Glicko-2
        const participants = standings.map((s) => ({
          user_id: s.user_id,
          score: s.score,
          rating: {
            rating: ratingMap.get(s.user_id)?.rating ?? 1500,
            deviation: ratingMap.get(s.user_id)?.deviation ?? 350,
            volatility: ratingMap.get(s.user_id)?.volatility ?? 0.06,
          } as GlickoPlayer,
        }));

        const newRatings = computeMatchRatings(participants);
        const winnerId = standings[0].user_id;

        // Upsert ratings for each participant
        for (const [uid, newRating] of newRatings) {
          const existing = ratingMap.get(uid);
          const isWinner = uid === winnerId;

          if (existing) {
            await supabase
              .from("arena_ratings")
              .update({
                rating: newRating.rating,
                deviation: newRating.deviation,
                volatility: newRating.volatility,
                matches_played: existing.matches_played + 1,
                wins: existing.wins + (isWinner ? 1 : 0),
                total_score: existing.total_score + (standings.find((s) => s.user_id === uid)?.score ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", uid);
          } else {
            await supabase
              .from("arena_ratings")
              .insert({
                user_id: uid,
                rating: newRating.rating,
                deviation: newRating.deviation,
                volatility: newRating.volatility,
                matches_played: 1,
                wins: isWinner ? 1 : 0,
                total_score: standings.find((s) => s.user_id === uid)?.score ?? 0,
              });
          }
        }
      } catch (err) {
        console.error("Failed to update ratings:", err);
      }
    };

    updateRatings();
  }, [match?.is_official, standings, user]);

  const isLoading = loadingMatch || loadingStandings;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const myStanding = standings?.find((s) => s.user_id === user?.id);
  const winner = standings?.[0];
  const isOfficial = match?.is_official;

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-6 w-6 text-primary" />;
    if (rank === 2) return <Medal className="h-6 w-6 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-muted-foreground" />;
    return <span className="text-lg font-bold text-muted-foreground">{rank}</span>;
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  return (
    <Layout>
      <div className="container mx-auto max-w-lg px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Winner Announcement */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <Trophy className="mx-auto mb-3 h-12 w-12 text-primary" />
            <h1 className="mb-1 font-display text-2xl font-bold text-foreground">
              {winner?.user_id === user?.id ? "You Won!" : `${winner?.display_name} Wins!`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {(match?.quizzes as any)?.title}
            </p>
            {isOfficial && (
              <Badge variant="secondary" className="mt-2 gap-1">
                <Crown className="h-3 w-3" />
                War
              </Badge>
            )}
          </div>

          {/* Your Result */}
          {myStanding && myStanding.rank !== 1 && (
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-sm text-muted-foreground">Your Rank</p>
              <p className="font-display text-3xl font-bold text-foreground">
                #{myStanding.rank}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Score: {myStanding.score} • Time: {formatTime(myStanding.total_time_ms)}
              </p>
            </div>
          )}

          {/* Final Standings */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">
              Final Standings
            </h2>
            <div className="space-y-2">
              {standings?.map((player) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: player.rank * 0.1 }}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                    player.user_id === user?.id
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center">
                      {getRankIcon(player.rank)}
                    </div>
                    <div>
                      <p className="font-body font-medium text-foreground">
                        {player.display_name}
                        {player.user_id === user?.id && (
                          <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(player.total_time_ms)} total
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-foreground">{player.score}</p>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Question Review */}
          {myStanding && match?.quiz_id && (
            <div className="rounded-xl border border-border bg-card p-4">
              <button
                onClick={() => setShowReview(!showReview)}
                className="flex w-full items-center justify-between text-left"
              >
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Question Review
                </h2>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${showReview ? "rotate-180" : ""}`} />
              </button>
              {showReview && (
                <div className="mt-4">
                  <QuestionReview
                    quizId={match.quiz_id}
                    answers={(myStanding.answers as any[]) ?? []}
                  />
                </div>
              )}
            </div>
          )}

          {/* Rating Note for Official */}
          {isOfficial && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                ELO ratings have been updated based on this war.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="flex-1 gap-2"
            >
              <Home className="h-4 w-4" />
              Home
            </Button>
            <Button
              onClick={() => navigate("/arena")}
              className="flex-1 gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Play Again
            </Button>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default ArenaResults;
