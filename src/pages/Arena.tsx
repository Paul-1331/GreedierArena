import { useState } from "react";
import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Swords, Plus, LogIn, Loader2, Trophy, Crown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import ArenaLeaderboard from "@/components/arena/ArenaLeaderboard";
import ContestsList from "@/components/arena/ContestsList";
import PastMatches from "@/components/arena/PastMatches";
import AdminContestCreator from "@/components/arena/AdminContestCreator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const generateRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const Arena = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState("");

  // Check for active match
  const { data: activeMatch } = useQuery({
    queryKey: ["arena-active-match", user?.id],
    queryFn: async () => {
      const { data: myParticipations, error: pErr } = await supabase
        .from("arena_participants")
        .select("match_id")
        .eq("user_id", user!.id);
      if (pErr) throw pErr;
      if (!myParticipations?.length) return null;

      const matchIds = myParticipations.map((p) => p.match_id);
      const { data: activeMatches, error: mErr } = await supabase
        .from("arena_matches")
        .select("id, room_code, status, is_official, quizzes (title)")
        .in("id", matchIds)
        .in("status", ["waiting", "countdown", "playing"])
        .limit(1);
      if (mErr) throw mErr;
      return activeMatches?.[0] ?? null;
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  // Fetch quizzes for casual match creation
  const { data: arenaQuizzes, isLoading: loadingQuizzes } = useQuery({
    queryKey: ["quizzes-for-arena", user?.id],
    queryFn: async () => {
      const { data: approved } = await supabase
        .from("quizzes")
        .select("id, title, category, difficulty, status, creator_id")
        .eq("status", "approved")
        .order("title", { ascending: true });
      const { data: own } = await supabase
        .from("quizzes")
        .select("id, title, category, difficulty, status, creator_id")
        .eq("creator_id", user!.id)
        .order("title", { ascending: true });
      const map = new Map<string, (typeof approved extends (infer T)[] | null ? T : never)>();
      approved?.forEach((q) => map.set(q.id, q));
      own?.forEach((q) => map.set(q.id, q));
      return Array.from(map.values());
    },
    enabled: !!user,
  });

  const createMatch = useMutation({
    mutationFn: async (quizId: string) => {
      const roomCode = generateRoomCode();
      const { data: match, error: matchError } = await supabase
        .from("arena_matches")
        .insert({ quiz_id: quizId, host_id: user!.id, room_code: roomCode, status: "waiting" })
        .select("id, room_code")
        .single();
      if (matchError) throw matchError;
      await supabase.from("arena_participants").insert({ match_id: match.id, user_id: user!.id, is_ready: true });
      return match;
    },
    onSuccess: (match) => {
      toast.success(`Match created! Code: ${match.room_code}`);
      setCreateDialogOpen(false);
      navigate(`/arena/${match.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const joinMatch = useMutation({
    mutationFn: async (roomCode: string) => {
      const code = roomCode.toUpperCase().trim();
      const { data: match, error: findError } = await supabase
        .from("arena_matches")
        .select("id, status, max_players")
        .eq("room_code", code)
        .single();
      if (findError || !match) throw new Error("Match not found");
      if (match.status !== "waiting") throw new Error("Match has already started");
      const { count } = await supabase
        .from("arena_participants")
        .select("*", { count: "exact", head: true })
        .eq("match_id", match.id);
      if (count && count >= match.max_players) throw new Error("Match is full");
      const { data: existing } = await supabase
        .from("arena_participants")
        .select("id")
        .eq("match_id", match.id)
        .eq("user_id", user!.id)
        .single();
      if (!existing) {
        const { error: joinError } = await supabase
          .from("arena_participants")
          .insert({ match_id: match.id, user_id: user!.id });
        if (joinError) throw joinError;
      }
      return match;
    },
    onSuccess: (match) => {
      toast.success("Joined match!");
      setJoinCode("");
      navigate(`/arena/${match.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!user) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <LogIn className="h-12 w-12 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold text-foreground">Sign in to compete</h2>
          <p className="max-w-md text-muted-foreground">You need to be signed in to join Arena matches.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto flex min-h-[70vh] flex-col items-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
            <Swords className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-3 text-center font-display text-4xl font-bold text-foreground">Arena</h1>
          <p className="mx-auto mb-8 max-w-md text-center text-muted-foreground">
            Compete in real-time quiz battles. Wars affect your ELO rating.
          </p>

          {/* Active Match Banner */}
          {activeMatch && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 rounded-lg border border-primary/30 bg-primary/10 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                    <Swords className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-body text-sm font-semibold text-foreground">Battle in progress</p>
                    <p className="text-xs text-muted-foreground">
                      Room: <span className="font-mono font-bold tracking-wider">{activeMatch.room_code}</span>
                      {" · "}{(activeMatch as any).quizzes?.title ?? "Quiz"}
                      {(activeMatch as any).is_official && " · War"}
                    </p>
                  </div>
                </div>
                <Button onClick={() => navigate(`/arena/${activeMatch.id}`)} size="sm" className="gap-1.5 font-body">
                  <LogIn className="h-3.5 w-3.5" />
                  Rejoin
                </Button>
              </div>
            </motion.div>
          )}

          <Tabs defaultValue="contests" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="contests" className="gap-1 font-body text-xs sm:text-sm">
                <Crown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Wars</span>
              </TabsTrigger>
              <TabsTrigger value="play" className="gap-1 font-body text-xs sm:text-sm">
                <Swords className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Friendly</span>
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="gap-1 font-body text-xs sm:text-sm">
                <Trophy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rankings</span>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1 font-body text-xs sm:text-sm">
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contests" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-body text-sm font-semibold text-foreground">Upcoming Wars</h2>
                <AdminContestCreator />
              </div>
              <ContestsList />
            </TabsContent>

            <TabsContent value="play" className="space-y-6">
              {/* Create Friendly */}
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="w-full gap-2 font-body">
                    <Plus className="h-5 w-5" />
                    Create Friendly Battle
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display">Create Friendly Battle</DialogTitle>
                    <DialogDescription>
                      Friendlies don't affect your rating. Select a quiz and invite friends.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <Label className="font-body">Select Quiz</Label>
                      <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
                        <SelectTrigger className="mt-1 font-body">
                          <SelectValue placeholder={loadingQuizzes ? "Loading..." : "Choose a quiz"} />
                        </SelectTrigger>
                        <SelectContent>
                          {arenaQuizzes?.map((quiz) => (
                            <SelectItem key={quiz.id} value={quiz.id}>
                              {quiz.title} ({quiz.category}){quiz.status !== "approved" ? ` [${quiz.status}]` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => selectedQuizId && createMatch.mutate(selectedQuizId)}
                      disabled={createMatch.isPending || !selectedQuizId}
                      className="w-full gap-2 font-body"
                    >
                      {createMatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create Match
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="rounded-lg border border-border bg-card p-6">
                <Label className="font-body">Join with Room Code</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    className="font-mono text-center text-lg tracking-widest"
                  />
                  <Button
                    onClick={() => joinCode.trim() && joinMatch.mutate(joinCode)}
                    disabled={joinMatch.isPending || !joinCode.trim()}
                    className="gap-2 font-body"
                  >
                    {joinMatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    Join
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="leaderboard">
              <ArenaLeaderboard />
            </TabsContent>

            <TabsContent value="history">
              <PastMatches />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </Layout>
  );
};

export default Arena;
