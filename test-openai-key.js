// Test script to verify OpenAI API key works directly
// Run with: node test-openai-key.js
// Or with env var: OPENAI_API_KEY=your_key_here node test-openai-key.js

// Get key from environment variable or require user to set it
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

async function testOpenAIKey() {
  console.log("[TEST] Testing OpenAI API key...")
  console.log("[TEST] Key present:", !!OPENAI_API_KEY)
  console.log("[TEST] Key length:", OPENAI_API_KEY?.length)
  console.log("[TEST] Key prefix:", OPENAI_API_KEY?.slice(0, 7))
  
  if (!OPENAI_API_KEY) {
    console.error("[TEST] ERROR: Please set OPENAI_API_KEY environment variable")
    console.error("[TEST] Usage: OPENAI_API_KEY=your_key_here node test-openai-key.js")
    console.error("[TEST] Or add it to your .env.local and run: node -r dotenv/config test-openai-key.js")
    process.exit(1)
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY.trim()}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
      }),
    })

    console.log("[TEST] Response status:", response.status)
    const responseText = await response.text()
    console.log("[TEST] Response body:", responseText)

    if (response.ok) {
      console.log("[TEST] ✅ SUCCESS: API key is valid!")
      const data = JSON.parse(responseText)
      console.log("[TEST] Response:", data.choices[0]?.message?.content)
    } else {
      console.error("[TEST] ❌ FAILED: API key is invalid or there's an error")
      try {
        const errorData = JSON.parse(responseText)
        console.error("[TEST] Error details:", errorData)
      } catch {
        console.error("[TEST] Raw error:", responseText)
      }
    }
  } catch (error) {
    console.error("[TEST] ❌ EXCEPTION:", error.message)
    process.exit(1)
  }
}

testOpenAIKey()

