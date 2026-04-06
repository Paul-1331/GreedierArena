import { motion } from "framer-motion";
import { ArrowRight, BookOpen, PenTool, Swords, Trophy, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import QuizCard from "@/components/QuizCard";
import Layout from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const features = [
  {
    icon: BookOpen,
    title: "Explore & Learn",
    description: "Browse hundreds of quizzes across categories. Learn something new every day.",
    path: "/explore",
  },
  {
    icon: PenTool,
    title: "Creator Studio",
    description: "Build your own quizzes, submit for approval, and share with the community.",
    path: "/creator",
  },
  {
    icon: Swords,
    title: "Arena",
    description: "Compete in real-time multiplayer quiz battles. Climb the leaderboard.",
    path: "/arena",
  },
];

const Index = () => {
  const { data: popularQuizzes, isLoading } = useQuery({
    queryKey: ["popular-quizzes-home"],
    queryFn: async () => {
      const { data: quizzes, error } = await supabase
        .from("quizzes")
        .select("id, slug, title, description, category, difficulty, time_limit_seconds")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;

      const ids = quizzes.map((q) => q.id);
      const { data: questions, error: qErr } = await supabase
        .from("quiz_questions")
        .select("quiz_id")
        .in("quiz_id", ids);
      if (qErr) throw qErr;

      const countMap: Record<string, number> = {};
      questions.forEach((q) => {
        countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1;
      });

      return quizzes.map((q) => ({
        id: q.slug,
        title: q.title,
        description: q.description ?? "",
        category: q.category,
        difficulty: (q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)) as "Easy" | "Medium" | "Hard",
        questionCount: countMap[q.id] || 0,
        timeLimitSeconds: q.time_limit_seconds ?? 30,
        plays: 0,
      }));
    },
  });

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_70%)]" />
        <div className="container relative mx-auto px-4 py-20 md:py-28">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-sm font-medium text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-primary" />
              The smartest quiz platform
            </div>
            <h1 className="mb-4 font-display text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              Learn. Compete.
              <span className="text-primary"> Dominate.</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
              Create quizzes, challenge friends, declare war, and climb the leaderboard.
              Knowledge is your greatest weapon.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link to="/explore">
                <Button size="lg" className="gap-2 font-body">
                  Start Playing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/creator">
                <Button variant="outline" size="lg" className="gap-2 font-body">
                  <PenTool className="h-4 w-4" />
                  Create a Quiz
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
            >
              <Link
                to={feature.path}
                className="group flex flex-col rounded-lg border border-border bg-card p-6 transition-all hover:shadow-card-hover hover:-translate-y-1"
              >
                <feature.icon className="mb-3 h-8 w-8 text-primary" />
                <h3 className="mb-1 font-display text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Popular Quizzes */}
      <section className="container mx-auto px-4 pb-20">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-foreground">Popular Quizzes</h2>
          <Link to="/explore">
            <Button variant="ghost" size="sm" className="gap-1 font-body text-muted-foreground">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : popularQuizzes && popularQuizzes.length > 0 ? (
            popularQuizzes.map((quiz, i) => (
              <QuizCard key={quiz.id} {...quiz} index={i} />
            ))
          ) : (
            <p className="col-span-full text-center text-muted-foreground">No quizzes yet.</p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 GreedyArena. Built for the curious mind.
        </div>
      </footer>
    </Layout>
  );
};

export default Index;