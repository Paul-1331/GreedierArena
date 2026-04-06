import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Trophy, Swords, Clock, Medal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

const PastMatches = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: matches, isLoading } = useQuery({
    queryKey: ["arena-past-matches", user?.id],
    queryFn: async () => {
      // Get user's participations
      const { data: participations, error: pErr } = await supabase
        .from("arena_participants")
        .select("match_id, score, answers, finished_at")
        .eq("user_id", user!.id)
        .order("joined_at", { ascending: false })
        .limit(50);
      if (pErr) throw pErr;
      if (!participations?.length) return [];

      const matchIds = participations.map((p) => p.match_id);

      // Get match details
      const { data: matchData, error: mErr } = await supabase
        .from("arena_matches")
        .select("id, room_code, status, is_official, finished_at, quizzes (title, category)")
        .in("id", matchIds)
        .eq("status", "finished");
      if (mErr) throw mErr;
      if (!matchData?.length) return [];

      const matchMap = new Map(matchData.map((m) => [m.id, m]));

      // Get all participants for these matches to determine placement
      const finishedIds = matchData.map((m) => m.id);
      const { data: allParticipants } = await supabase
        .from("arena_participants")
        .select("match_id, user_id, score, answers")
        .in("match_id", finishedIds);

      // Group by match, determine winner and player count
      const matchInfoMap = new Map<string, { playerCount: number; winnerId: string | null; myRank: number }>();
      for (const mid of finishedIds) {
        const players = (allParticipants ?? [])
          .filter((p) => p.match_id === mid && (p.answers as any[])?.length > 0);
        const sorted = [...players].sort((a, b) => b.score - a.score);
        const myRank = sorted.findIndex((p) => p.user_id === user!.id) + 1;
        matchInfoMap.set(mid, {
          playerCount: players.length,
          winnerId: sorted[0]?.user_id ?? null,
          myRank: myRank || sorted.length + 1,
        });
      }

      return participations
        .filter((p) => matchMap.has(p.match_id))
        .map((p) => {
          const match = matchMap.get(p.match_id)!;
          const info = matchInfoMap.get(p.match_id);
          const answeredCount = (p.answers as any[])?.length ?? 0;
          return {
            match_id: p.match_id,
            score: p.score,
            answeredCount,
            finished_at: match.finished_at,
            room_code: match.room_code,
            is_official: (match as any).is_official ?? false,
            quiz: match.quizzes as any,
            playerCount: info?.playerCount ?? 0,
            isWinner: info?.winnerId === user!.id,
            myRank: info?.myRank ?? 0,
          };
        });
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!matches?.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Swords className="mx-auto mb-3 h-10 w-10 opacity-50" />
        <p className="font-body">No past battles yet.</p>
        <p className="text-sm">Play some battles to see them here!</p>
      </div>
    );
  }

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return <Trophy className="h-4 w-4 text-primary" />;
    if (rank === 2) return <Medal className="h-4 w-4 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-3.5 w-3.5 text-muted-foreground" />;
    return <span className="text-xs font-bold text-muted-foreground">#{rank}</span>;
  };

  return (
    <div className="space-y-2">
      {matches.map((match, idx) => (
        <motion.div
          key={match.match_id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.03 }}
          onClick={() => navigate(`/arena/${match.match_id}/results`)}
          className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/50 px-4 py-3 transition-colors hover:bg-muted"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center">
              {getRankDisplay(match.myRank)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-body text-sm font-medium text-foreground">
                  {match.quiz?.title ?? "Quiz"}
                </p>
                {match.is_official ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">War</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Friendly</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{match.playerCount} player{match.playerCount !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{match.answeredCount} answered</span>
                {match.finished_at && (
                  <>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(match.finished_at), { addSuffix: true })}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-bold text-foreground">{match.score}</p>
            <p className="text-xs text-muted-foreground">pts</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default PastMatches;
