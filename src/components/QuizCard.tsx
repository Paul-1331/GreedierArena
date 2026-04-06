import { memo } from "react";
import { motion } from "framer-motion";
import { Clock, Users, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface QuizCardProps {
  id: string;
  title: string;
  description: string;
  category: string;
  questionCount: number;
  plays: number;
  difficulty: "Easy" | "Medium" | "Hard";
  timeLimitSeconds?: number;
  index?: number;
}

const difficultyColor = {
  Easy: "bg-primary/10 text-primary",
  Medium: "bg-accent/20 text-accent-foreground",
  Hard: "bg-destructive/10 text-destructive",
};

const QuizCard = ({ id, title, description, category, questionCount, plays, difficulty, timeLimitSeconds = 30, index = 0 }: QuizCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Link
        to={`/play/${id}`}
        className="group flex flex-col rounded-lg border border-border bg-card p-5 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1"
      >
        <div className="mb-3 flex items-center justify-between">
          <Badge variant="secondary" className="font-body text-xs">
            {category}
          </Badge>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColor[difficulty]}`}>
            {difficulty}
          </span>
        </div>

        <h3 className="mb-1 font-display text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-4 flex-1 text-sm text-muted-foreground">{description}</p>

        <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {questionCount} Qs
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {plays.toLocaleString()} plays
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {questionCount * timeLimitSeconds}s
          </span>
        </div>

        <Button size="sm" className="w-full font-body">
          Play Quiz
        </Button>
      </Link>
    </motion.div>
  );
};

export default memo(QuizCard);
