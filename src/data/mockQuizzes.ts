export interface Quiz {
  id: string;
  title: string;
  description: string;
  category: string;
  questionCount: number;
  plays: number;
  difficulty: "Easy" | "Medium" | "Hard";
}

export const mockQuizzes: Quiz[] = [
  {
    id: "1",
    title: "JavaScript Fundamentals",
    description: "Test your knowledge of core JavaScript concepts and ES6+ features.",
    category: "Programming",
    questionCount: 10,
    plays: 2450,
    difficulty: "Easy",
  },
  {
    id: "2",
    title: "World Capitals Challenge",
    description: "How many world capitals can you identify? Put your geography skills to the test.",
    category: "Geography",
    questionCount: 15,
    plays: 5120,
    difficulty: "Medium",
  },
  {
    id: "3",
    title: "Quantum Physics Basics",
    description: "Explore the strange world of quantum mechanics through this quiz.",
    category: "Science",
    questionCount: 12,
    plays: 890,
    difficulty: "Hard",
  },
  {
    id: "4",
    title: "Movie Trivia: 2000s",
    description: "How well do you remember the blockbusters of the 2000s decade?",
    category: "Entertainment",
    questionCount: 10,
    plays: 3200,
    difficulty: "Easy",
  },
  {
    id: "5",
    title: "Data Structures & Algorithms",
    description: "Challenge yourself with questions on arrays, trees, graphs and more.",
    category: "Programming",
    questionCount: 20,
    plays: 1800,
    difficulty: "Hard",
  },
  {
    id: "6",
    title: "History of Ancient Rome",
    description: "From the Republic to the Empire — test your knowledge of Rome.",
    category: "History",
    questionCount: 12,
    plays: 1450,
    difficulty: "Medium",
  },
];
