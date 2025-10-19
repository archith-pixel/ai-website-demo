// Import necessary libraries
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises; // Use the promise-based version of fs
const path = require('path');
const { exec } = require('child_process'); // To run shell commands (DANGEROUS!)
require('dotenv').config(); // Load variables from .env file

// --- Configuration ---
const app = express();
const port = 3000;
const targetFile = 'index.html';

// Configure Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- Middleware ---
// Serve static files (admin.html, index.html)
app.use(express.static(__dirname));
// Parse JSON bodies from requests
app.use(express.json());

// --- Routes ---

// Serve the admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve the live website that will be changed
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// The "magic" endpoint that triggers the AI and Git
app.post('/update-feature', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`Received request: ${prompt}`);

    try {
        // --- Step 1: Read the current file ---
        console.log(`Reading file: ${targetFile}`);
        const currentHtml = await fs.readFile(targetFile, 'utf8');

        // --- Step 2: Formulate the prompt for the AI ---
        const aiPrompt = `
You are an expert HTML web developer.
A user wants to modify their website.
Here is the current content of their 'index.html' file:

\`\`\`html
${currentHtml}
\`\`\`

Here is the user's request: "${prompt}"

Your task is to return the **new, full** 'index.html' content with the requested change.
Respond with **ONLY** the raw HTML code. Do not include \`\`\`html, markdown, or any other explanations.
`;

        // --- Step 3: Call the AI ---
        console.log('Sending prompt to AI...');
        const result = await model.generateContent(aiPrompt);
        const response = result.response;
        const newHtmlContent = response.text();
        console.log('AI generated new HTML.');

        // --- Step 4: Write the new content to the file ---
        console.log(`Writing new content to ${targetFile}`);
        await fs.writeFile(targetFile, newHtmlContent, 'utf8');

        // --- Step 5: Run Git commands to commit and push ---
        // !! DANGER: This is a major security risk (Command Injection) !!
        // !! It is only for a local-only, trusted demo !!
        const commitMessage = `feat: AI implemented request - "${prompt}"`;
        const gitCommands = [
            `git config user.email "ai-agent@demo.com"`, // Config for this commit
            `git config user.name "AI Agent"`,
            `git add ${targetFile}`,
            `git commit -m "${commitMessage}"`,
            `git push origin main` // Assumes your branch is 'main'
        ].join(' && ');

        console.log('Running git commands...');
        exec(gitCommands, (error, stdout, stderr) => {
            if (error) {
                console.error(`Git error: ${stderr}`);
                // Don't block the response; just report the error
                return res.status(500).json({ 
                    error: 'File was updated, but Git push failed.', 
                    details: stderr 
                });
            }

            console.log(`Git push successful: ${stdout}`);
            // Send a success response
            res.json({
                message: 'Feature implemented and pushed to GitHub!',
                git_output: stdout,
            });
        });

    } catch (err) {
        console.error('Error in /update-feature:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Admin panel running at http://localhost:${port}`);
    console.log(`Live website running at http://localhost:${port}/index`);
});