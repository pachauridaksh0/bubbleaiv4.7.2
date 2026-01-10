
import { runAutonomousAgent } from "../autonomous/handler";
import { AgentInput, AgentExecutionResult } from "../types";

export const runCustomAgent = async (input: AgentInput): Promise<AgentExecutionResult> => {
    // If no custom agent data is provided but chat has specific mode, fallback to autonomous
    if (!input.customAgent && !input.chat.agent_id) {
        return runAutonomousAgent(input);
    }

    const agentName = input.customAgent?.name || 'Custom Agent';
    const agentPrompt = input.customAgent?.system_prompt || '';

    // Handle Python Capability
    let capabilityInstruction = "";
    if (input.customAgent?.capabilities?.code_execution) {
        capabilityInstruction = `
=== CAPABILITY: CODE INTERPRETER (PYTHON) ===
You have access to a simulated Python environment.
- Use this for: Math, Data Analysis, String Manipulation, Logic Puzzles.
- TO USE: Write python code inside \`\`\`python ... \`\`\` blocks.
- The environment will "run" this code and display output.
- You can assume libraries like 'pandas', 'matplotlib', 'numpy' are available for simulation.
- If the user asks for a chart, write code to generate it (e.g. using matplotlib).
- ALWAYS explain what you are going to do before writing the code block.
`;
    }

    const modifiedProfile = {
        ...(input.profile || {}),
        // We override the user's global custom instructions with the Agent's specific instructions
        custom_instructions: `
=== CUSTOM AGENT IDENTITY: ${agentName} ===
${agentPrompt}

${capabilityInstruction}

(Note: You are acting as this specific agent. Prioritize these instructions over general behavior.)
        `
    } as any;

    const modifiedInput: AgentInput = {
        ...input,
        profile: modifiedProfile
    };

    return await runAutonomousAgent(modifiedInput);
};
