import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Trophy, Medal, Flame, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_score: number;
  matches_played: number;
  wins: number;
  rating?: number;
  deviation?: number;
}

const ArenaLeaderboard = () => {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<"rating" | "score" | "wins">("rating");

  // Fetch Glicko-2 ratings
  const { data: ratings } = useQuery({
    queryKey: ["arena-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arena_ratings")
        .select("user_id, rating, deviation, matches_played, wins, total_score");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30000,
  });

  // Fetch official match stats
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["arena-leaderboard-official"],
    queryFn: async () => {
      // Get all finished official matches
      const { data: finishedMatches, error: mErr } = await supabase
        .from("arena_matches")
        .select("id")
        .eq("status", "finished")
        .eq("is_official", true);
      if (mErr) throw mErr;
      if (!finishedMatches?.length) return [];

      const matchIds = finishedMatches.map((m) => m.id);

      const { data: participants, error: pErr } = await supabase
        .from("arena_participants")
        .select("user_id, score, match_id, answers")
        .in("match_id", matchIds);
      if (pErr) throw pErr;
      if (!participants?.length) return [];

      const active = participants.filter((p) => {
        const ans = p.answers as any[];
        return ans && ans.length > 0;
      });

      // Group by match for wins
      const matchGroups = new Map<string, typeof active>();
      active.forEach((p) => {
        const group = matchGroups.get(p.match_id) ?? [];
        group.push(p);
        matchGroups.set(p.match_id, group);
      });

      const winnerIds = new Set<string>();
      matchGroups.forEach((players) => {
        if (players.length < 2) return;
        const sorted = [...players].sort((a, b) => b.score - a.score);
        winnerIds.add(`${sorted[0].match_id}:${sorted[0].user_id}`);
      });

      const userMap = new Map<string, { total_score: number; matches_played: number; wins: number }>();
      active.forEach((p) => {
        const existing = userMap.get(p.user_id) ?? { total_score: 0, matches_played: 0, wins: 0 };
        existing.total_score += p.score;
        existing.matches_played += 1;
        if (winnerIds.has(`${p.match_id}:${p.user_id}`)) existing.wins += 1;
        userMap.set(p.user_id, existing);
      });

      const userIds = Array.from(userMap.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return userIds.map((uid) => ({
        user_id: uid,
        display_name: profileMap.get(uid)?.display_name ?? "Player",
        avatar_url: profileMap.get(uid)?.avatar_url ?? null,
        ...userMap.get(uid)!,
      })) as LeaderboardEntry[];
    },
    staleTime: 30000,
  });

  // Merge ratings into leaderboard
  const ratingMap = new Map(ratings?.map((r) => [r.user_id, r]) ?? []);

  // Build merged list: include anyone with ratings OR official stats
  const mergedMap = new Map<string, LeaderboardEntry>();

  leaderboard?.forEach((entry) => {
    const r = ratingMap.get(entry.user_id);
    mergedMap.set(entry.user_id, {
      ...entry,
      rating: r?.rating ?? 1500,
      deviation: r?.deviation ?? 350,
    });
  });

  // Add players who have ratings but no official match stats yet (shouldn't happen often)
  ratings?.forEach((r) => {
    if (!mergedMap.has(r.user_id)) {
      mergedMap.set(r.user_id, {
        user_id: r.user_id,
        display_name: "Player",
        avatar_url: null,
        total_score: r.total_score,
        matches_played: r.matches_played,
        wins: r.wins,
        rating: r.rating,
        deviation: r.deviation,
      });
    }
  });

  const sorted = Array.from(mergedMap.values()).sort((a, b) => {
    if (sortBy === "rating") return (b.rating ?? 1500) - (a.rating ?? 1500) || b.total_score - a.total_score;
    if (sortBy === "score") return b.total_score - a.total_score || b.wins - a.wins;
    return b.wins - a.wins || b.total_score - a.total_score;
  });

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-primary" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-4 w-4 text-muted-foreground" />;
    return <span className="text-sm font-bold text-muted-foreground">{rank}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-3 h-10 w-10 opacity-50" />
        <p className="font-body">No wars completed yet.</p>
        <p className="text-sm">Play wars to see rankings!</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as "rating" | "score" | "wins")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rating" className="gap-1.5 font-body text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            Rating
          </TabsTrigger>
          <TabsTrigger value="score" className="gap-1.5 font-body text-xs">
            <Target className="h-3.5 w-3.5" />
            Score
          </TabsTrigger>
          <TabsTrigger value="wins" className="gap-1.5 font-body text-xs">
            <Flame className="h-3.5 w-3.5" />
            Wins
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {sorted.map((entry, idx) => {
          const rank = idx + 1;
          return (
            <motion.div
              key={entry.user_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                entry.user_id === user?.id
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : "bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center">
                  {getRankIcon(rank)}
                </div>
                <div>
                  <p className="font-body text-sm font-medium text-foreground">
                    {entry.display_name}
                    {entry.user_id === user?.id && (
                      <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.matches_played} war{entry.matches_played !== 1 ? "s" : ""}
                    {" · "}{entry.wins} win{entry.wins !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-bold text-foreground">
                  {sortBy === "rating"
                    ? entry.rating ?? 1500
                    : sortBy === "score"
                      ? entry.total_score
                      : entry.wins}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sortBy === "rating"
                    ? `±${Math.round(entry.deviation ?? 350)}`
                    : sortBy === "score"
                      ? "total pts"
                      : `win${entry.wins !== 1 ? "s" : ""}`}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ArenaLeaderboard;
