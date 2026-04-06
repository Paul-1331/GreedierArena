import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Crown } from "lucide-react";
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

const AdminContestCreator = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("50");
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [allowUnrated, setAllowUnrated] = useState(true);

  // Check admin status
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .single();
      return !!data;
    },
    enabled: !!user,
  });

  // Fetch approved quizzes and admin's own quizzes (including unapproved drafts)
  const { data: quizzes, isLoading: loadingQuizzes } = useQuery({
    queryKey: ["quizzes-for-war", user?.id],
    queryFn: async () => {
      const { data: approved, error: approvedError } = await supabase
        .from("quizzes")
        .select("id, title, category, difficulty, status, creator_id")
        .eq("status", "approved")
        .order("title", { ascending: true });
      if (approvedError) throw approvedError;

      const { data: own, error: ownError } = await supabase
        .from("quizzes")
        .select("id, title, category, difficulty, status, creator_id")
        .eq("creator_id", user!.id)
        .order("title", { ascending: true });
      if (ownError) throw ownError;

      const map = new Map<string, (typeof approved extends (infer T)[] | null ? T : never)>();
      approved?.forEach((q) => map.set(q.id, q));
      own?.forEach((q) => map.set(q.id, q));

      return Array.from(map.values());
    },
    enabled: !!isAdmin,
  });

  const createContest = useMutation({
    mutationFn: async () => {
      if (!scheduledDate || !scheduledTime) {
        throw new Error("War start date and time are required");
      }

      const scheduledStartAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      const parsedMinRating = minRating.trim() === "" ? null : parseInt(minRating, 10);
      const parsedMaxRating = maxRating.trim() === "" ? null : parseInt(maxRating, 10);

      if (parsedMinRating !== null && Number.isNaN(parsedMinRating)) {
        throw new Error("Invalid minimum rating");
      }
      if (parsedMaxRating !== null && Number.isNaN(parsedMaxRating)) {
        throw new Error("Invalid maximum rating");
      }
      if (
        parsedMinRating !== null &&
        parsedMaxRating !== null &&
        parsedMinRating > parsedMaxRating
      ) {
        throw new Error("Minimum rating cannot be greater than maximum rating");
      }

      const roomCode = generateRoomCode();
      const { data: match, error } = await supabase
        .from("arena_matches")
        .insert({
          quiz_id: selectedQuizId,
          host_id: user!.id,
          room_code: roomCode,
          status: "waiting",
          is_official: true,
          scheduled_start_at: scheduledStartAt,
          max_players: parseInt(maxPlayers) || 50,
          min_rating: parsedMinRating,
          max_rating: parsedMaxRating,
          allow_unrated: allowUnrated,
          join_cutoff_ratio: 0.75,
        })
        .select("id, room_code")
        .single();

      if (error) throw error;

      return match;
    },
    onSuccess: (match) => {
      toast.success(`War created! Code: ${match.room_code}`);
      setOpen(false);
      setSelectedQuizId("");
      setScheduledDate("");
      setScheduledTime("");
      setMinRating("");
      setMaxRating("");
      setAllowUnrated(true);
      queryClient.invalidateQueries({ queryKey: ["arena-contests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isAdmin) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 font-body border-primary/30 text-primary">
          <Crown className="h-3.5 w-3.5" />
          Declare War
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            Declare War
          </DialogTitle>
          <DialogDescription>
            Wars count toward player ELO ratings and leaderboard standings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label className="font-body">Quiz</Label>
            <Select value={selectedQuizId} onValueChange={setSelectedQuizId}>
              <SelectTrigger className="mt-1 font-body">
                <SelectValue placeholder={loadingQuizzes ? "Loading..." : "Choose a quiz"} />
              </SelectTrigger>
              <SelectContent>
                {quizzes?.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.title} ({q.category} · {q.difficulty}){q.status !== "approved" ? ` [${q.status}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-body">Start Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1 font-body"
              />
            </div>
            <div>
              <Label className="font-body">Start Time</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="mt-1 font-body"
              />
            </div>
          </div>

          <div>
            <Label className="font-body">Max Players</Label>
            <Input
              type="number"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              min={2}
              max={200}
              className="mt-1 font-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-body">Min Rating (optional)</Label>
              <Input
                type="number"
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                min={0}
                className="mt-1 font-body"
              />
            </div>
            <div>
              <Label className="font-body">Max Rating (optional)</Label>
              <Input
                type="number"
                value={maxRating}
                onChange={(e) => setMaxRating(e.target.value)}
                min={0}
                className="mt-1 font-body"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="allow-unrated"
              checked={allowUnrated}
              onCheckedChange={(checked) => setAllowUnrated(checked === true)}
            />
            <Label htmlFor="allow-unrated" className="font-body text-sm">
              Allow unrated users (matches played = 0)
            </Label>
          </div>

          <Button
            onClick={() => createContest.mutate()}
            disabled={createContest.isPending || !selectedQuizId || !scheduledDate || !scheduledTime}
            className="w-full gap-2 font-body"
          >
            {createContest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Declare War
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminContestCreator;
