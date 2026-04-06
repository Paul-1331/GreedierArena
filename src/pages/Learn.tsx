import Layout from "@/components/Layout";
import { GraduationCap, Clock, BookOpen, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const upcomingTopics = [
  { title: "Data Structures 101", category: "Programming", type: "Lecture Series", icon: BookOpen },
  { title: "World History: Ancient Civilizations", category: "History", type: "Video Course", icon: Video },
  { title: "Introduction to Quantum Physics", category: "Science", type: "Lecture Series", icon: BookOpen },
  { title: "Geography: Mapping the World", category: "Geography", type: "Interactive", icon: GraduationCap },
];

const Learn = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <h1 className="mb-2 font-display text-3xl font-bold text-foreground">Learn</h1>
        <p className="mb-8 text-muted-foreground">
          Lectures, courses, and study materials on various topics — coming soon.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          {upcomingTopics.map((topic) => (
            <div
              key={topic.title}
              className="relative flex items-start gap-4 rounded-lg border border-border bg-card p-5 opacity-75"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <topic.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-base font-semibold text-foreground">{topic.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{topic.category}</p>
                <Badge variant="secondary" className="mt-2 gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  Coming Soon
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-dashed border-border bg-muted/50 p-8 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold text-foreground">More content on the way</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We're building lectures, video courses, and interactive learning materials. Stay tuned!
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Learn;
