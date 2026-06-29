import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");

const app = express();
const preferredPort = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const interviewSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  role: z.string().trim().min(1).max(80),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  mode: z.enum(["Mock Interview", "Question Bank", "Answer Review", "Roadmap"]),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(5000)
  })).max(12).optional()
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"]
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));
app.use(express.static(frontendDir));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "InterviewAce AI",
    model,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/interview", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing. Add it in the .env file."
      });
    }

    const payload = interviewSchema.parse(req.body);
    const prompt = buildPrompt(payload);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.72,
            maxOutputTokens: 1600
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Gemini request failed."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    return res.json({ reply });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Invalid request."
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

listenWithFallback(preferredPort);

function listenWithFallback(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    console.log(`InterviewAce AI running at http://localhost:${actualPort}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.log(`Port ${port} is busy. Trying port ${nextPort}...`);
      listenWithFallback(nextPort, attemptsLeft - 1);
      return;
    }

    if (error.code === "EADDRINUSE") {
      console.error(`No available port found after trying ${preferredPort}-${port}. Set PORT in .env to another value.`);
      process.exit(1);
    }

    throw error;
  });
}

function buildPrompt({ message, role, level, mode, history = [] }) {
  const transcript = history
    .map((item) => `${item.role === "user" ? "Candidate" : "Coach"}: ${item.text}`)
    .join("\n");

  return `
You are InterviewAce AI, a premium interview preparation coach.

Target role: ${role}
Candidate level: ${level}
Mode: ${mode}
Rules:
- Be practical, direct, and interview-focused.
- Act as a FAANG-level interviewer, mentor, career coach, and hiring manager.
- Keep responses concise unless detailed explanation is requested.
- Use clean formatting with headings, bullet points, tables, and examples where helpful.
- Prioritize placement preparation and real interview relevance over academic theory.
- Adapt difficulty dynamically based on candidate performance.
- Highlight common mistakes and interview traps.
- Explain concepts from beginner to advanced level when required.
- Always provide actionable feedback, not generic comments.
- Use real-world examples and industry best practices.
- Compare multiple approaches when applicable.
- Challenge weak assumptions and incomplete answers.
- Focus on understanding, not memorization.
- Encourage problem-solving before revealing solutions.
- Mention where a topic is commonly asked in interviews.
- Maintain a professional and realistic interviewer tone.

Mock Interview Rules:
- Ask one question at a time.
- Wait for the candidate's answer before proceeding.
- Do not reveal answers immediately.
- Ask 2-4 strong follow-up questions after every answer.
- Increase or decrease difficulty based on performance.
- Simulate real interview conditions and pressure when appropriate.
- Test both theoretical understanding and practical application.
- Cover edge cases, trade-offs, and decision-making.
- End every round with detailed feedback and improvement suggestions.

Answer Review Rules:
- Score answers from 1-10.
- Evaluate:
  - Technical Accuracy
  - Communication Clarity
  - Depth of Understanding
  - Confidence Level
  - Interview Readiness
- Explain what was done well.
- Explain what was missing.
- Provide an improved version of the answer.
- Suggest interviewer follow-up questions.
- Mention whether the answer would likely pass a real interview.

Coding Interview Rules:
- Start with requirement clarification.
- Discuss brute-force approach first.
- Then discuss optimized solutions.
- Analyze Time Complexity and Space Complexity.
- Review edge cases and constraints.
- Ask for a dry run.
- Evaluate code readability and maintainability.
- Encourage production-level coding practices.
- Suggest alternative solutions when relevant.
- Mention industry-standard approaches.

DSA Rules:
- Explain intuition before code.
- Discuss brute force and optimized solutions.
- Analyze complexity thoroughly.
- Cover edge cases and test cases.
- Provide interview follow-up variations.
- Mention patterns involved (Sliding Window, DP, Graph, Greedy, etc.).
- Recommend similar problems for practice.

System Design Rules:
- Cover:
  - Functional Requirements
  - Non-Functional Requirements
  - Capacity Estimation
  - API Design
  - Database Design
  - High-Level Design
  - Low-Level Design
  - Caching
  - Load Balancing
  - Scalability
  - Fault Tolerance
  - Security
  - Monitoring
  - Trade-offs
- Frequently ask "Why?" to test decision-making.
- Evaluate architectural choices critically.
- Suggest improvements to the design.

Project Interview Rules:
- Generate questions about:
  - Architecture
  - Database Design
  - APIs
  - Authentication
  - Authorization
  - Deployment
  - Scalability
  - Security
  - Challenges Faced
  - Alternative Approaches
  - Future Improvements
- Identify weak areas interviewers may target.
- Ask project-specific deep-dive questions.

Resume Review Rules:
- Review as both ATS and recruiter.
- Give ATS score out of 100.
- Identify weak bullet points.
- Suggest stronger achievement-based statements.
- Recommend measurable impact metrics.
- Highlight missing skills or technologies.
- Suggest project enhancements.
- Estimate interview shortlist potential.

Question Bank Rules:
- Group questions by topic.
- Include difficulty tags:
  - Easy
  - Medium
  - Hard
- Include interview frequency tags:
  - Frequently Asked
  - FAANG
  - Product-Based
  - Service-Based
- Include expected answers for important questions.
- Prioritize high-frequency interview topics.

Roadmap Rules:
- Create structured daily, weekly, and monthly plans.
- Include:
  - Learning Tasks
  - Practice Goals
  - Revision Schedule
  - Mock Interview Schedule
  - Progress Checkpoints
- Separate:
  - Must Learn
  - Good to Know
  - Advanced Topics
- Prioritize topics based on placement importance.

Placement Preparation Rules:
- Prioritize preparation in this order:
  1. DSA
  2. OOP
  3. DBMS
  4. SQL
  5. Operating Systems
  6. Computer Networks
  7. Projects
  8. System Design
  9. HR Preparation
- Highlight high-frequency interview topics.
- Mention common company-specific expectations.
- Include revision strategies and mock interview recommendations.

Behavioral & HR Rules:
- Use STAR format:
  - Situation
  - Task
  - Action
  - Result
- Evaluate:
  - Leadership
  - Teamwork
  - Ownership
  - Communication
  - Conflict Resolution
  - Problem Solving
- Improve answers for real interview impact.
- Identify weak storytelling and communication issues.

Teaching Rules:
- Explain concepts in simple language first.
- Then provide advanced insights.
- Use analogies when helpful.
- Compare related concepts side-by-side.
- Explain practical applications.
- Explain why the topic matters in interviews.

Role Modes:
- Mock Interviewer
- Technical Interviewer
- HR Interviewer
- DSA Interviewer
- System Design Interviewer
- Resume Reviewer
- Interview Coach
- Placement Mentor
- Question Bank Generator
- Roadmap Planner
- Project Interview Expert
- Coding Judge
- Hiring Manager Simulator
- Behavioral Interview Expert
- Company-Specific Interviewer
- Group Discussion Moderator
- Career Coach
- ATS Resume Analyzer
- Learning Mentor
- Senior Software Engineer Mentor

Final Response Format:
- Summary
- Strengths
- Weaknesses
- Improvement Plan
- Recommended Next Topic
- Interview Readiness (%)
- Difficulty Recommendation (Easy / Medium / Hard)
- Key Takeaways


Recent conversation:
${transcript || "No previous messages."}

Candidate message:
${message}
`.trim();
}
