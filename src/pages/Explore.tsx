import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, Users, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

const categories = ["All", "Computer Science", "Mathematics", "Physics", "AI/ML", "Electrical & Electronics", "Mechanical", "Biology", "Data Science", "Other"];

const difficultyColor: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  hard: "bg-destructive/15 text-destructive",
};

const Explore = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ["explore-quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, slug, title, description, category, difficulty, created_at, time_limit_seconds")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch question counts
      const ids = data.map((q) => q.id);
      const { data: counts } = await supabase
        .from("quiz_questions")
        .select("quiz_id")
        .in("quiz_id", ids);

      const countMap: Record<string, number> = {};
      counts?.forEach((c) => {
        countMap[c.quiz_id] = (countMap[c.quiz_id] || 0) + 1;
      });

      return data.map((q) => ({ ...q, questionCount: countMap[q.id] || 0 }));
    },
  });

  const filtered = (quizzes ?? []).filter((q) => {
    const matchesSearch = q.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || q.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <h1 className="mb-2 font-display text-3xl font-bold text-foreground">Explore</h1>
        <p className="mb-8 text-muted-foreground">Discover quizzes from the community and test your knowledge.</p>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search quizzes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 font-body" />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Button key={cat} variant={activeCategory === cat ? "default" : "outline"} size="sm" className="font-body" onClick={() => setActiveCategory(cat)}>
              {cat}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((quiz, i) => (
              <motion.div
                key={quiz.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="group flex flex-col rounded-lg border border-border bg-card p-5 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Badge variant="secondary" className="font-body text-xs">{quiz.category}</Badge>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${difficultyColor[quiz.difficulty] ?? ""}`}>
                    {quiz.difficulty}
                  </span>
                </div>
                <h3 className="mb-1 font-display text-lg font-semibold text-foreground">{quiz.title}</h3>
                <p className="mb-4 flex-1 text-sm text-muted-foreground line-clamp-2">{quiz.description}</p>
                <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3" />{quiz.questionCount} Qs</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{quiz.questionCount * (quiz.time_limit_seconds ?? 30)}s</span>
                </div>
                <Button size="sm" className="w-full font-body" onClick={() => navigate(`/play/${quiz.slug}`)}>
                  Play Quiz
                </Button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            No quizzes found. Try a different search or category.
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Explore;
