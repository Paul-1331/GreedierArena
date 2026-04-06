import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Copy, Users, Play, Check, LogOut, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface Participant {
  id: string;
  user_id: string;
  is_ready: boolean;
  joined_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

const ArenaLobby = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Fetch match details
  const { data: match, isLoading: loadingMatch } = useQuery({
    queryKey: ["arena-match", matchId],
    queryFn: async () => {
      await supabase.rpc("process_due_wars");

      const { data, error } = await supabase
        .from("arena_matches")
        .select(`
          *,
          quizzes (
            id,
            title,
            category,
            difficulty,
            time_limit_seconds
          )
        `)
        .eq("id", matchId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    refetchInterval: 3000,
  });

  // Fetch participants
  const { data: participants, isLoading: loadingParticipants } = useQuery({
    queryKey: ["arena-participants", matchId],
    queryFn: async () => {
      // First get participants
      const { data: participantsData, error: pError } = await supabase
        .from("arena_participants")
        .select("id, user_id, is_ready, joined_at")
        .eq("match_id", matchId!)
        .order("joined_at", { ascending: true });
      
      if (pError) throw pError;
      if (!participantsData || participantsData.length === 0) return [];

      // Then get profiles for those user_ids
      const userIds = participantsData.map((p) => p.user_id);
      const { data: profilesData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      if (profileError) throw profileError;

      // Merge them
      const profileMap = new Map(profilesData?.map((p) => [p.user_id, p]) ?? []);
      return participantsData.map((p) => ({
        ...p,
        profiles: profileMap.get(p.user_id) ?? null,
      })) as Participant[];
    },
    enabled: !!matchId,
    refetchInterval: 3000,
  });

  // Subscribe to realtime changes
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`arena-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "arena_participants",
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["arena-participants", matchId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "arena_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ status: string }>) => {
          queryClient.invalidateQueries({ queryKey: ["arena-match", matchId] });
          // Navigate to play when game starts
          if (payload.new && (payload.new as any).status === "playing") {
            navigate(`/arena/${matchId}/play`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, queryClient, navigate]);

  // Toggle ready status
  const toggleReady = useMutation({
    mutationFn: async () => {
      const currentParticipant = participants?.find((p) => p.user_id === user?.id);
      if (!currentParticipant) throw new Error("Not in match");

      const { error } = await supabase
        .from("arena_participants")
        .update({ is_ready: !currentParticipant.is_ready })
        .eq("id", currentParticipant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arena-participants", matchId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Leave match
  const leaveMatch = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("arena_participants")
        .delete()
        .eq("match_id", matchId!)
        .eq("user_id", user!.id);

      if (error) throw error;

      // If host leaves and match is waiting, delete the match
      if (match?.host_id === user?.id && match?.status === "waiting") {
        await supabase.from("arena_matches").delete().eq("id", matchId!);
      }
    },
    onSuccess: () => {
      toast.success("Left the match");
      navigate("/arena");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Start the game (host only)
  const startGame = useMutation({
    mutationFn: async () => {
      // Set to countdown — ArenaPlay will handle the countdown→playing transition
      const { error } = await supabase
        .from("arena_matches")
        .update({
          status: "countdown",
          started_at: new Date().toISOString(),
        })
        .eq("id", matchId!);

      if (error) throw error;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Join official war from lobby page (supports late join).
  const joinOfficialWar = useMutation({
    mutationFn: async () => {
      if (!matchId || !user?.id) throw new Error("Missing match or user");

      const { error } = await supabase
        .from("arena_participants")
        .insert({ match_id: matchId, user_id: user.id });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Joined war");
      queryClient.invalidateQueries({ queryKey: ["arena-participants", matchId] });
      queryClient.invalidateQueries({ queryKey: ["arena-match", matchId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copyRoomCode = () => {
    if (match?.room_code) {
      navigator.clipboard.writeText(match.room_code);
      setCopied(true);
      toast.success("Room code copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isHost = match?.host_id === user?.id;
  const isOfficial = !!match?.is_official;
  const myParticipant = participants?.find((p) => p.user_id === user?.id);
  const isJoined = !!myParticipant;
  const readyCount = participants?.filter((p) => p.is_ready).length ?? 0;
  const allReady = participants && participants.length >= 2 && readyCount === participants.length;

  // FIX 1: Navigate via useEffect, never during render
  useEffect(() => {
    if (!match || !matchId) return;
    if (match.status === "playing" || match.status === "countdown") {
      if (isOfficial && !isJoined) return;
      navigate(`/arena/${matchId}/play`, { replace: true });
    } else if (match.status === "finished") {
      navigate(`/arena/${matchId}/results`, { replace: true });
    }
  }, [match?.status, matchId, navigate, isOfficial, isJoined]);

  if (loadingMatch || loadingParticipants) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!match) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <h2 className="font-display text-2xl font-bold text-foreground">Match not found</h2>
          <Button onClick={() => navigate("/arena")}>Back to Arena</Button>
        </div>
      </Layout>
    );
  }

  if ((match.status === "playing" || match.status === "countdown") && !(isOfficial && !isJoined)) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-lg px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Room Code Card */}
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="mb-2 text-sm text-muted-foreground">Room Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="font-mono text-4xl font-bold tracking-widest text-foreground">
                {match.room_code}
              </span>
              <Button variant="ghost" size="icon" onClick={copyRoomCode}>
                {copied ? <Check className="h-5 w-5 text-primary" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Quiz Info */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Quiz</p>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {(match.quizzes as any)?.title}
            </h2>
            <div className="mt-1 flex gap-2">
              <Badge variant="secondary">{(match.quizzes as any)?.category}</Badge>
              <Badge variant="outline">{(match.quizzes as any)?.difficulty}</Badge>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Players ({participants?.length ?? 0}/{match.max_players})
                </span>
              </div>
              {!isOfficial && (
                <span className="text-xs text-muted-foreground">{readyCount} ready</span>
              )}
            </div>

            <div className="space-y-2">
              <AnimatePresence>
                {participants?.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {p.user_id === match.host_id && (
                        <Crown className="h-4 w-4 text-primary" />
                      )}
                      <span className="font-body text-sm text-foreground">
                        {p.profiles?.display_name ?? "Player"}
                      </span>
                    </div>
                    {!isOfficial && (
                      <Badge variant={p.is_ready ? "default" : "outline"} className="text-xs">
                        {p.is_ready ? "Ready" : "Not Ready"}
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {isOfficial && !isJoined && (
              <Button
                onClick={() => joinOfficialWar.mutate()}
                disabled={joinOfficialWar.isPending}
                className="flex-1 gap-2"
              >
                {joinOfficialWar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Join War
              </Button>
            )}

            {(!isOfficial || isJoined) && (
              <Button
                variant="outline"
                onClick={() => leaveMatch.mutate()}
                disabled={leaveMatch.isPending}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                Leave
              </Button>
            )}

            {!isOfficial && !isHost && (
              <Button
                onClick={() => toggleReady.mutate()}
                disabled={toggleReady.isPending}
                variant={myParticipant?.is_ready ? "secondary" : "default"}
                className="flex-1 gap-2"
              >
                {myParticipant?.is_ready ? (
                  <>
                    <Check className="h-4 w-4" />
                    Ready
                  </>
                ) : (
                  "Ready Up"
                )}
              </Button>
            )}

            {!isOfficial && isHost && (
              <Button
                onClick={() => startGame.mutate()}
                disabled={startGame.isPending || !allReady}
                className="flex-1 gap-2"
              >
                {startGame.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Start Game
              </Button>
            )}
          </div>

          {!isOfficial && isHost && !allReady && (
            <p className="text-center text-xs text-muted-foreground">
              {participants && participants.length < 2
                ? "Need at least 2 players to start"
                : "Waiting for all players to be ready..."}
            </p>
          )}

          {isOfficial && !isJoined && match.status !== "finished" && (
            <p className="text-center text-xs text-muted-foreground">
              Join is allowed even after start, but late joiners lose elapsed time.
            </p>
          )}
        </motion.div>
      </div>
    </Layout>
  );
};

export default ArenaLobby;
