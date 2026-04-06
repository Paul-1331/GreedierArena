import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Trophy, Clock, Users, Swords, Crown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { format, formatDistanceToNow, isPast } from "date-fns";

const ContestsList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: contests, isLoading } = useQuery({
    queryKey: ["arena-contests"],
    queryFn: async () => {
      await supabase.rpc("process_due_wars");

      // Fetch official matches that are upcoming or active
      const { data, error } = await supabase
        .from("arena_matches")
        .select("id, room_code, status, scheduled_start_at, quiz_id, host_id, max_players, created_at, quizzes (title, category, difficulty)")
        .eq("is_official", true)
        .in("status", ["waiting", "countdown", "playing"])
        .order("scheduled_start_at", { ascending: true });
      if (error) throw error;

      // Get participant counts
      if (!data?.length) return [];
      const matchIds = data.map((m) => m.id);
      const { data: participants } = await supabase
        .from("arena_participants")
        .select("match_id, user_id")
        .in("match_id", matchIds);

      const countMap = new Map<string, number>();
      const joinedMap = new Map<string, boolean>();
      participants?.forEach((p) => {
        countMap.set(p.match_id, (countMap.get(p.match_id) ?? 0) + 1);
        if (p.user_id === user?.id) joinedMap.set(p.match_id, true);
      });

      return data.map((m) => ({
        ...m,
        participant_count: countMap.get(m.id) ?? 0,
        has_joined: joinedMap.get(m.id) ?? false,
      }));
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!contests?.length) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Crown className="mx-auto mb-3 h-10 w-10 opacity-50" />
        <p className="font-body">No upcoming wars right now.</p>
        <p className="text-sm">Check back later for new wars!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contests.map((contest, idx) => {
        const quiz = contest.quizzes as any;
        const startTime = contest.scheduled_start_at
          ? new Date(contest.scheduled_start_at)
          : null;
        const isStarted = contest.status === "playing" || contest.status === "countdown";
        const canJoin = contest.status === "waiting" || contest.status === "countdown" || contest.status === "playing";

        return (
          <motion.div
            key={contest.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="rounded-lg border border-primary/20 bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                   <h3 className="font-body text-sm font-semibold text-foreground">
                    {quiz?.title ?? "War"}
                  </h3>
                  <Badge variant="secondary" className="text-xs">War</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {quiz?.category && <span>{quiz.category}</span>}
                  {quiz?.difficulty && <span>• {quiz.difficulty}</span>}
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {contest.participant_count}/{contest.max_players}
                  </span>
                </div>
                {startTime && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {isPast(startTime)
                      ? `Started ${formatDistanceToNow(startTime, { addSuffix: true })}`
                      : `Starts ${formatDistanceToNow(startTime, { addSuffix: true })} · ${format(startTime, "MMM d, h:mm a")}`}
                  </p>
                )}
              </div>
              <div>
                {isStarted && contest.has_joined ? (
                  <Button
                    size="sm"
                    onClick={() => navigate(`/arena/${contest.id}`)}
                    className="gap-1.5 font-body"
                  >
                    <Swords className="h-3.5 w-3.5" />
                    Rejoin
                  </Button>
                ) : canJoin ? (
                  <Button
                    size="sm"
                    variant={contest.has_joined ? "secondary" : "default"}
                    onClick={() => navigate(`/arena/${contest.id}`)}
                    className="gap-1.5 font-body"
                  >
                    {contest.has_joined ? "View Lobby" : isStarted ? "Join Late" : "Join"}
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {contest.status}
                  </Badge>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default ContestsList;
