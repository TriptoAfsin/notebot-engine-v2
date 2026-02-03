import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "NoteBot Engine V2 API",
      version: "2.0.0",
      description:
        "Backend API for BUTEX NoteBot — serves academic notes, lab reports, routines, results, question banks, and entertainment content for the NoteBot Messenger bot and web app.",
      contact: {
        name: "TriptoAfsin",
        url: "https://github.com/TriptoAfsin",
      },
    },
    servers: [
      {
        url: "https://notebot-engine.up.railway.app",
        description: "Production",
      },
      {
        url: "http://localhost:8969",
        description: "Development",
      },
    ],
    tags: [
      { name: "App", description: "General app info" },
      { name: "Levels", description: "Academic levels" },
      { name: "Subjects", description: "Subjects by level" },
      { name: "Topics", description: "Topics by subject" },
      { name: "Notes", description: "Notes by topic" },
      { name: "Labs", description: "Lab reports" },
      { name: "Routines", description: "Class routines" },
      { name: "Results", description: "Exam results" },
      { name: "Question Banks", description: "Question banks by level" },
      { name: "Entertainment", description: "Jokes and fun" },
      { name: "AI", description: "Auto RAG search" },
      { name: "Compat", description: "V1 backward compatibility endpoints" },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
