import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Send, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const quizSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().trim().min(1, "Description is required").max(1000, "Description too long"),
  category: z.string().min(1, "Category is required"),
  difficulty: z.string().min(1, "Difficulty is required"),
});

type QuestionType = "single_mcq" | "multi_select" | "numeric";

interface Question {
  id: number;
  type: QuestionType;
  text: string;
  options: string[];
  correctIndex: number;
  correctIndices: number[];
  numericAnswer: string;
  explanation: string;
}

export interface EditQuizData {
  id: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  status: string;
  time_limit_seconds: number | null;
}

interface CreateQuizFormProps {
  editQuiz?: EditQuizData;
  onEditComplete?: () => void;
}

const CATEGORIES = ["Computer Science", "Mathematics", "Physics", "AI/ML", "Electrical & Electronics", "Mechanical", "Biology", "Data Science", "Other"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "single_mcq", label: "Single Choice" },
  { value: "multi_select", label: "Multiple Choice" },
  { value: "numeric", label: "Numeric Answer" },
];

const emptyQuestion = (): Question => ({
  id: Date.now(),
  type: "single_mcq",
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  correctIndices: [],
  numericAnswer: "",
  explanation: "",
});

const CreateQuizForm = ({ editQuiz, onEditComplete }: CreateQuizFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!editQuiz;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [timePerQuestion, setTimePerQuestion] = useState<string>("30");
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [loaded, setLoaded] = useState(false);

  // Load existing questions when editing
  const { data: existingQuestions } = useQuery({
    queryKey: ["edit-quiz-questions", editQuiz?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", editQuiz!.id)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: isEditing,
  });

  // Populate form when editing
  useEffect(() => {
    if (editQuiz && existingQuestions && !loaded) {
      setTitle(editQuiz.title);
      setDescription(editQuiz.description ?? "");
      setCategory(editQuiz.category);
      setDifficulty(editQuiz.difficulty.charAt(0).toUpperCase() + editQuiz.difficulty.slice(1));
      setTimePerQuestion(String(editQuiz.time_limit_seconds ?? 30));

      const mapped: Question[] = existingQuestions.map((q, i) => {
        const rawType = q.question_type;
        const qType: QuestionType = rawType === "multi_mcq" ? "multi_select" : (rawType as QuestionType);
        const rawOptions = Array.isArray(q.options) ? q.options : [];
        const options = rawOptions.map((o: any) => String(o ?? ""));
        const correct = q.correct_answer;
        return {
          id: Date.now() + i,
          type: qType,
          text: q.question_text,
          options: qType === "numeric" ? ["", "", "", ""] : [...options, ...Array(Math.max(0, 4 - options.length)).fill("")].slice(0, 4),
          correctIndex: qType === "single_mcq" ? (typeof correct === "number" ? correct : Number(correct) || 0) : 0,
          correctIndices: qType === "multi_select" ? (Array.isArray(correct) ? correct.map(Number) : [Number(correct) || 0]) : [],
          numericAnswer: qType === "numeric" ? String(correct ?? "") : "",
          explanation: q.explanation ?? "",
        };
      });

      setQuestions(mapped.length > 0 ? mapped : [emptyQuestion()]);
      setLoaded(true);
    }
  }, [editQuiz, existingQuestions, loaded]);

  // Reset form when editQuiz changes to undefined (switching away from edit)
  useEffect(() => {
    if (!editQuiz) {
      setTitle("");
      setDescription("");
      setCategory("");
      setDifficulty("");
      setTimePerQuestion("30");
      setQuestions([emptyQuestion()]);
      setLoaded(false);
    }
  }, [editQuiz]);

  const validateQuestions = (qs: Question[]) => {
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q.text.trim()) throw new Error(`Question ${i + 1}: Text is required`);
      if (q.type === "single_mcq" || q.type === "multi_select") {
        for (let j = 0; j < q.options.length; j++) {
          if (!q.options[j].trim()) throw new Error(`Question ${i + 1}: Option ${j + 1} is empty`);
        }
        if (q.type === "multi_select" && q.correctIndices.length < 1) {
          throw new Error(`Question ${i + 1}: Select at least one correct answer`);
        }
      }
      if (q.type === "numeric") {
        if (q.numericAnswer.trim() === "" || isNaN(Number(q.numericAnswer))) {
          throw new Error(`Question ${i + 1}: Valid numeric answer is required`);
        }
      }
    }
  };

  const buildCorrectAnswer = (q: Question) => {
    if (q.type === "single_mcq") return q.correctIndex;
    if (q.type === "multi_select") return q.correctIndices;
    return Number(q.numericAnswer);
  };

  const submitQuiz = useMutation({
    mutationFn: async (asDraft: boolean) => {
      const quizResult = quizSchema.safeParse({ title, description, category, difficulty });
      if (!quizResult.success) throw new Error(quizResult.error.errors[0].message);
      validateQuestions(questions);

      const newStatus = asDraft ? "draft" : "submitted";

      if (isEditing) {
        // Update existing quiz
        const { error: quizError } = await supabase
          .from("quizzes")
          .update({
            title: quizResult.data.title,
            description: quizResult.data.description,
            category: quizResult.data.category,
            difficulty: quizResult.data.difficulty.toLowerCase(),
            time_limit_seconds: Math.max(5, Math.min(600, Number(timePerQuestion) || 30)),
            status: newStatus as any,
          })
          .eq("id", editQuiz.id);
        if (quizError) throw quizError;

        // Delete old questions, insert new
        const { error: delErr } = await supabase.from("quiz_questions").delete().eq("quiz_id", editQuiz.id);
        if (delErr) throw delErr;

        const questionsToInsert = questions.map((q, index) => ({
          quiz_id: editQuiz.id,
          question_text: q.text.trim(),
          question_type: q.type,
          options: q.type === "numeric" ? [] : q.options.map((o) => o.trim()),
          correct_answer: buildCorrectAnswer(q),
          order_index: index,
          explanation: q.explanation.trim() || null,
        }));

        const { error: questionsError } = await supabase.from("quiz_questions").insert(questionsToInsert);
        if (questionsError) throw questionsError;
        return { id: editQuiz.id };
      } else {
        // Create new quiz
        const tempId = crypto.randomUUID();
        const slug = quizResult.data.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") + "-" + tempId.slice(0, 8);
        const { data: quiz, error: quizError } = await supabase
          .from("quizzes")
          .insert({
            title: quizResult.data.title,
            description: quizResult.data.description,
            category: quizResult.data.category,
            difficulty: quizResult.data.difficulty.toLowerCase(),
            time_limit_seconds: Math.max(5, Math.min(600, Number(timePerQuestion) || 30)),
            creator_id: user!.id,
            status: newStatus as any,
            slug,
          })
          .select("id")
          .single();
        if (quizError) throw quizError;

        const questionsToInsert = questions.map((q, index) => ({
          quiz_id: quiz.id,
          question_text: q.text.trim(),
          question_type: q.type,
          options: q.type === "numeric" ? [] : q.options.map((o) => o.trim()),
          correct_answer: buildCorrectAnswer(q),
          order_index: index,
          explanation: q.explanation.trim() || null,
        }));

        const { error: questionsError } = await supabase.from("quiz_questions").insert(questionsToInsert);
        if (questionsError) throw questionsError;
        return quiz;
      }
    },
    onSuccess: (_, asDraft) => {
      toast.success(isEditing
        ? (asDraft ? "Quiz saved as draft!" : "Quiz updated and submitted!")
        : (asDraft ? "Quiz saved as draft!" : "Quiz submitted for approval!")
      );
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-review-queue"] });
      if (isEditing && onEditComplete) {
        onEditComplete();
      } else {
        setTitle("");
        setDescription("");
        setCategory("");
        setDifficulty("");
        setQuestions([emptyQuestion()]);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const removeQuestion = (id: number) => {
    if (questions.length === 1) return;
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: number, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const updateOption = (qId: number, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId ? { ...q, options: q.options.map((o, i) => (i === optIndex ? value : o)) } : q
      )
    );
  };

  const toggleMultiSelectIndex = (qId: number, optIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const indices = q.correctIndices.includes(optIndex)
          ? q.correctIndices.filter((i) => i !== optIndex)
          : [...q.correctIndices, optIndex];
        return { ...q, correctIndices: indices };
      })
    );
  };

  return (
    <div className="space-y-6">
      {isEditing && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm font-body text-foreground">
            Editing: <span className="font-semibold">{editQuiz.title}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Changes will reset the quiz status. You can save as draft or submit for review.
          </p>
        </div>
      )}

      <div className="space-y-5 rounded-lg border border-border bg-card p-6">
        <div>
          <Label className="font-body">Quiz Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JavaScript Mastery" className="mt-1 font-body" maxLength={200} />
        </div>
        <div>
          <Label className="font-body">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of your quiz..." className="mt-1 font-body" rows={3} maxLength={1000} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label className="font-body">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 font-body"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-body">Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="mt-1 font-body"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="font-body">Time per Question</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={timePerQuestion}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "");
                  setTimePerQuestion(val);
                }}
                onBlur={() => {
                  const num = Math.max(5, Math.min(600, Number(timePerQuestion) || 30));
                  setTimePerQuestion(String(num));
                }}
                className="font-body [appearance:textfield]"
              />
              <span className="text-sm text-muted-foreground">sec</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-foreground">Questions</h2>
        {questions.map((q, qi) => (
          <div key={q.id} className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Question {qi + 1}</span>
              <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-3">
              <Label className="mb-1 block text-xs text-muted-foreground">Question Type</Label>
              <Select value={q.type} onValueChange={(v: QuestionType) => updateQuestion(q.id, { type: v, correctIndices: [], correctIndex: 0, numericAnswer: "" })}>
                <SelectTrigger className="font-body h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Input value={q.text} onChange={(e) => updateQuestion(q.id, { text: e.target.value })} placeholder="Enter your question..." className="mb-3 font-body" maxLength={500} />

            {q.type === "single_mcq" && (
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="relative">
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      className={`pr-8 font-body ${q.correctIndex === oi ? "border-primary ring-1 ring-primary" : ""}`}
                      maxLength={200}
                    />
                    <button
                      type="button"
                      onClick={() => updateQuestion(q.id, { correctIndex: oi })}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 transition-colors ${
                        q.correctIndex === oi ? "border-primary bg-primary" : "border-muted-foreground"
                      }`}
                      title="Mark as correct answer"
                    />
                  </div>
                ))}
              </div>
            )}

            {q.type === "multi_select" && (
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="relative flex items-center gap-2">
                    <Checkbox
                      checked={q.correctIndices.includes(oi)}
                      onCheckedChange={() => toggleMultiSelectIndex(q.id, oi)}
                      className="shrink-0"
                    />
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                      placeholder={`Option ${oi + 1}`}
                      className={`font-body ${q.correctIndices.includes(oi) ? "border-primary ring-1 ring-primary" : ""}`}
                      maxLength={200}
                    />
                  </div>
                ))}
                <p className="col-span-2 text-xs text-muted-foreground">Check all correct answers</p>
              </div>
            )}

            {q.type === "numeric" && (
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Correct Numeric Answer</Label>
                <Input
                  type="number"
                  value={q.numericAnswer}
                  onChange={(e) => updateQuestion(q.id, { numericAnswer: e.target.value })}
                  placeholder="e.g. 42"
                  className="font-body max-w-[200px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            )}

            <div className="mt-3">
              <Label className="mb-1 block text-xs text-muted-foreground">Explanation (shown after answering)</Label>
              <Textarea
                value={q.explanation}
                onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                placeholder="Explain the correct answer (optional)..."
                className="font-body"
                rows={2}
                maxLength={1000}
              />
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={addQuestion} className="w-full gap-2 font-body">
          <Plus className="h-4 w-4" /> Add Question
        </Button>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => submitQuiz.mutate(true)}
          disabled={submitQuiz.isPending}
          size="lg"
          className="flex-1 gap-2 font-body"
        >
          {submitQuiz.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save as Draft
        </Button>
        <Button
          onClick={() => submitQuiz.mutate(false)}
          disabled={submitQuiz.isPending}
          size="lg"
          className="flex-1 gap-2 font-body"
        >
          {submitQuiz.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit for Approval
        </Button>
      </div>
    </div>
  );
};

export default CreateQuizForm;
