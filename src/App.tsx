import React, { useState } from "react";
import { Play, Sparkles, MessageSquare, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";

// Puter.js is loaded via <script> tag in index.html
declare const puter: any;

const JAVA_KEYWORDS = [
  "abstract", "boolean", "break", "byte", "case", "catch", "char", "class",
  "continue", "default", "do", "double", "else", "enum", "extends", "final",
  "finally", "float", "for", "if", "implements", "import", "instanceof", "int",
  "interface", "long", "new", "package", "private", "protected", "public",
  "return", "short", "static", "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "try", "void", "volatile", "while"
];

// Helper: extract text from Puter AI response
function extractPuterText(response: any): string {
  if (typeof response === "string") return response;
  return (
    response?.message?.content?.[0]?.text ||
    response?.text ||
    response?.content?.[0]?.text ||
    String(response)
  );
}

export default function App() {
  const [code, setCode] = useState(
    `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n`
  );
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const [showKeywords, setShowKeywords] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationFeedback, setVerificationFeedback] = useState<{
    status: "correct" | "incorrect";
    message: string;
  } | null>(null);

  // ── Run Java via Wandbox API (free, no key, works on GitHub Pages) ──
  const handleRunCode = async () => {
    setIsRunning(true);
    setOutput("Executing...");
    setVerificationFeedback(null);

    try {
      // Wandbox requires the filename to match the public class name in Java.
      const classMatch = code.match(/public\s+class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : "Main";

      // Step 1: get a valid Java compiler name from Wandbox
      const listRes = await fetch("https://wandbox.org/api/list.json");
      if (!listRes.ok) {
        setOutput("Error: Could not reach Wandbox. Check your connection.");
        return;
      }
      const compilers = await listRes.json();
      const javaCompiler = compilers.find(
        (c: any) => c.language === "Java" || c.language === "java"
      );
      if (!javaCompiler) {
        setOutput("Error: No Java compiler found on Wandbox.");
        return;
      }

      // Step 2: compile and run
      const response = await fetch("https://wandbox.org/api/compile.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiler: javaCompiler.name,
          code,
          save: false,
        }),
      });

      if (!response.ok) {
        setOutput(`Error: Wandbox API returned ${response.status}. Try again.`);
        return;
      }

      const data = await response.json();

      // Wandbox returns compiler_error for compile failures
      if (data.compiler_error) {
        setOutput(`Compilation Error:\n${data.compiler_error}`);
        return;
      }

      const execOutput = data.program_output || data.program_error || "(no output)";
      const hasError = !!data.program_error && !data.program_output;

      if (hasError) {
        setOutput(`Runtime Error:\n${data.program_error}`);
      } else {
        setOutput(execOutput);
      }

      if (currentTask && !hasError) {
        setIsVerifying(true);
        try {
          const verifyPrompt = `You are evaluating a student's Java code for a specific task.
Task: ${currentTask}
Code:
\`\`\`java
${code}
\`\`\`
Execution Output:
\`\`\`
${execOutput}
\`\`\`

Evaluate if the code correctly implements the task AND strictly adheres to the requested keyword limits.
If it is correct, output EXACTLY the word "CORRECT".
If it is incorrect, output "INCORRECT: " followed by a brief reason why.`;

          const verifyRes = await puter.ai.chat(verifyPrompt, {
            model: "claude-sonnet-4-6",
          });
          const result = extractPuterText(verifyRes);

          if (result.trim().startsWith("CORRECT")) {
            setVerificationFeedback({ status: "correct", message: "That's correct!" });
          } else {
            const msg = result.replace("INCORRECT:", "").trim();
            setVerificationFeedback({
              status: "incorrect",
              message: `You're wrong, do it again! ${msg}`,
            });
          }
        } catch (e: any) {
          console.error("Puter verify error:", e);
        }
      }
    } catch (e: any) {
      setOutput(`Network Error: ${e?.message ?? String(e)}\n\nCheck your internet connection and try again.`);
    } finally {
      setIsRunning(false);
      setIsVerifying(false);
    }
  };

  // ── Toggle keyword selection ───────────────────────────────────
  const handleToggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword]
    );
  };

  // ── Generate task via Puter AI ─────────────────────────────────
  const handleGenerateTask = async () => {
    if (selectedKeywords.length === 0) return;

    const prevTask = currentTask;
    setShowKeywords(false);
    setIsAiLoading(true);
    setCurrentTask(null);
    setVerificationFeedback(null);

    try {
      const keywordList = selectedKeywords.join(", ");
      let extraInstructions = "";
      if (prevTask) {
        extraInstructions = `\n7. IMPORTANT: Do NOT generate a task similar to this previous one:\n"${prevTask}"\nProvide an entirely new scenario.`;
      }

      const prompt = `I am practicing Java. Generate a very short programming task where I MUST use exactly all of the following Java keywords: [${keywordList}].

IMPORTANT RULES:
1. DO NOT PROVIDE ANY CODE IN YOUR RESPONSE.
2. ONLY provide the instruction for the task.
3. Be specific about what the output should include.
4. YOU MUST specify strict numerical limits for how many times each keyword or related concept can be used (e.g., "use exactly 2 'int' variables", "exactly 1 'if' condition", etc.).
5. Keep it brief.
6. Example for 'int, if, else': "Build a function returning true or false using exactly 2 'int' variables, exactly 1 'if' block and exactly 1 'else' block and print the result."${extraInstructions}`;

      const response = await puter.ai.chat(prompt, {
        model: "claude-sonnet-4-6",
        systemPrompt: "You are a concise Java programming instructor. Always generate unique tasks.",
      });

      setCurrentTask(extractPuterText(response));
    } catch (error: any) {
      console.error("Puter AI error:", error);
      setCurrentTask("Failed to get task. Make sure you are signed in to Puter and try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-200 font-sans flex flex-col md:flex-row h-screen overflow-hidden">

      {/* LEFT SIDE: Editor and Output */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-white/10">

        {/* Editor Header */}
        <div className="h-12 border-b border-white/10 flex items-center justify-between px-6 bg-[#121212]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-[#E76F00] rounded flex items-center justify-center font-bold text-black text-[10px] italic">JAVA</div>
            <span className="text-sm font-medium tracking-tight text-white/80">main.java</span>
          </div>
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className="flex items-center gap-2 bg-[#E76F00] hover:bg-orange-400 text-black px-4 py-2 rounded text-xs font-bold transition-colors disabled:opacity-50 uppercase tracking-widest"
          >
            <Play className="w-4 h-4 fill-black" />
            {isRunning ? "RUNNING..." : "RUN CODE"}
          </button>
        </div>

        {/* Code Editor */}
        <div className="flex-1 overflow-hidden relative bg-[#1E1E1E]">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-full p-6 bg-transparent text-gray-300 font-mono text-[13px] leading-relaxed outline-none resize-none"
            placeholder="Type your Java code here..."
          />
        </div>

        {/* Output Console */}
        <div className="h-1/3 border-t border-white/10 flex flex-col bg-[#0F0F0F]">
          <div className="h-10 border-b border-white/5 flex items-center px-4 bg-[#1A1A1A]">
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">Standard Output</span>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-transparent">
            {output ? (
              <pre className="font-mono text-xs text-green-400/80 whitespace-pre-wrap">{output}</pre>
            ) : (
              <span className="font-mono text-xs text-white/50 italic">No output yet...</span>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: AI Companion & Keywords */}
      <div className="w-full md:w-[320px] lg:w-[360px] flex flex-col bg-[#121212] flex-shrink-0">

        {/* Keywords Header */}
        <div className="p-4 border-b border-white/10">
          <div className="relative">
            <button
              onClick={() => setShowKeywords(!showKeywords)}
              className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 text-gray-200 px-4 py-2 rounded transition-colors border border-white/10"
            >
              <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide truncate">
                <Sparkles className="w-4 h-4 text-[#E76F00] shrink-0" />
                {selectedKeywords.length > 0
                  ? `Selected: ${selectedKeywords.join(", ")}`
                  : "Select Java Keywords"}
              </div>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showKeywords ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showKeywords && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-20 top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/20 rounded-xl shadow-2xl overflow-hidden max-h-64 flex flex-col"
                >
                  <div className="p-4 border-b border-white/10 bg-[#1A1A1A]/90 backdrop-blur sticky top-0">
                    <p className="text-sm font-light text-white italic">What did you learn today?</p>
                  </div>
                  <div className="overflow-y-auto p-4 flex flex-wrap gap-2 custom-scrollbar">
                    {JAVA_KEYWORDS.map((kw) => {
                      const isSelected = selectedKeywords.includes(kw);
                      return (
                        <button
                          key={kw}
                          onClick={() => handleToggleKeyword(kw)}
                          className={`px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${
                            isSelected
                              ? "bg-[#E76F00] text-black shadow-[0_0_15px_rgba(231,111,0,0.3)]"
                              : "bg-white/5 text-white/30 hover:bg-white/10 border border-white/10"
                          }`}
                        >
                          {kw} {isSelected ? "✓" : "+"}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-4 border-t border-white/10 bg-[#1A1A1A] flex justify-end">
                    <button
                      onClick={handleGenerateTask}
                      disabled={selectedKeywords.length === 0}
                      className="px-6 py-2 bg-white text-black font-bold text-sm rounded-full hover:bg-gray-200 transition-colors uppercase tracking-widest disabled:opacity-50"
                    >
                      Generate Task
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* AI Companion Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-12 border-b border-white/10 flex items-center px-6">
            <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
              <MessageSquare className="w-4 h-4" />
              AI Companion · Puter
            </h2>
          </div>

          <div className="flex-1 overflow-auto p-6 custom-scrollbar">
            {selectedKeywords.length === 0 && !isAiLoading && !currentTask && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/20">
                <Sparkles className="w-8 h-8 mb-3 opacity-20" />
                <p className="text-sm italic">Select keywords above to get a personalized challenge.</p>
                <p className="text-xs mt-2 opacity-60">Powered by Puter AI — no API key needed</p>
              </div>
            )}

            {isAiLoading && (
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-xl rounded-tl-sm text-sm text-gray-300">
                  <div className="flex gap-1 items-center h-5 px-2">
                    <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce" />
                    <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce delay-75" />
                    <div className="w-1 h-1 rounded-full bg-white/40 animate-bounce delay-150" />
                  </div>
                </div>
              </div>
            )}

            {!isAiLoading && currentTask && (
              <div className="flex flex-col gap-6">
                <div className="flex items-start gap-3 justify-end">
                  <div className="bg-[#E76F00]/20 border border-[#E76F00]/30 p-3 rounded-xl rounded-tr-sm text-[11px] font-medium text-[#E76F00] max-w-[85%]">
                    Task for keywords: {selectedKeywords.join(", ")}
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-5 rounded-xl rounded-tl-sm text-sm leading-relaxed text-gray-300 max-w-[85%] relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#E76F00]/50"></div>
                    <div className="markdown-body">
                      <Markdown>{currentTask}</Markdown>
                    </div>
                  </div>
                </div>

                {isVerifying ? (
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl rounded-tl-sm text-sm text-gray-300">
                      Evaluating code...
                    </div>
                  </div>
                ) : verificationFeedback ? (
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${verificationFeedback.status === "correct" ? "bg-green-500/20 border-green-500/40" : "bg-red-500/20 border-red-500/40"}`}>
                      <div className={`w-2 h-2 rounded-full ${verificationFeedback.status === "correct" ? "bg-green-400" : "bg-red-400"}`}></div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-5 rounded-xl rounded-tl-sm text-sm leading-relaxed text-gray-300 max-w-[85%] relative overflow-hidden flex flex-col items-start gap-4">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${verificationFeedback.status === "correct" ? "bg-green-500/50" : "bg-red-500/50"}`}></div>
                      <div className="markdown-body">
                        <Markdown>{verificationFeedback.message}</Markdown>
                      </div>
                      {verificationFeedback.status === "correct" && (
                        <button
                          onClick={handleGenerateTask}
                          className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded text-xs font-bold uppercase transition-colors"
                        >
                          Continue with this keyword
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
