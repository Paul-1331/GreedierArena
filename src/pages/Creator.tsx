import { useState } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { FolderOpen, PenLine, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import MyQuizzesList from "@/components/creator/MyQuizzesList";
import CreateQuizForm from "@/components/creator/CreateQuizForm";
import type { EditQuizData } from "@/components/creator/CreateQuizForm";
import AdminReviewQueue from "@/components/creator/AdminReviewQueue";

type Tab = "my-quizzes" | "create" | "review";

const Creator = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("my-quizzes");
  const [editQuiz, setEditQuiz] = useState<EditQuizData | undefined>();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user!.id,
        _role: "admin",
      });
      if (error) throw error;
      return data as boolean;
    },
    enabled: !!user,
  });

  const handleEdit = (quiz: EditQuizData) => {
    setEditQuiz(quiz);
    setActiveTab("create");
  };

  const handleEditComplete = () => {
    setEditQuiz(undefined);
    setActiveTab("my-quizzes");
  };

  const handleTabChange = (tab: Tab) => {
    if (tab !== "create") setEditQuiz(undefined);
    setActiveTab(tab);
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { key: "my-quizzes", label: "My Quizzes", icon: <FolderOpen className="h-4 w-4" /> },
    { key: "create", label: editQuiz ? "Edit Quiz" : "Create Quiz", icon: <PenLine className="h-4 w-4" /> },
    { key: "review", label: "Review Queue", icon: <ShieldCheck className="h-4 w-4" />, adminOnly: true },
  ];

  return (
    <Layout>
      <div className="container mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-2 font-display text-3xl font-bold text-foreground">Creator Studio</h1>
        <p className="mb-6 text-muted-foreground">
          Build, manage, and track your quizzes.
        </p>

        <div className="mb-8 flex gap-2">
          {tabs
            .filter((t) => !t.adminOnly || isAdmin)
            .map((t) => (
              <Button
                key={t.key}
                variant={activeTab === t.key ? "default" : "outline"}
                onClick={() => handleTabChange(t.key)}
                className="gap-2 font-body"
                size="sm"
              >
                {t.icon}
                {t.label}
              </Button>
            ))}
        </div>

        {activeTab === "my-quizzes" && <MyQuizzesList onEditQuiz={handleEdit} isAdmin={isAdmin} />}
        {activeTab === "create" && <CreateQuizForm key={editQuiz?.id ?? "new"} editQuiz={editQuiz} onEditComplete={handleEditComplete} />}
        {activeTab === "review" && isAdmin && <AdminReviewQueue />}
      </div>
    </Layout>
  );
};

export default Creator;
