const express = require('express');
const cors = require('cors');
const path = require('path');
const faqs = require('./faqs.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Find best matching FAQ based on keywords
function findBestMatch(userMessage) {
  const userWords = userMessage.toLowerCase().split(/\s+/);
  let bestMatch = null;
  let highestScore = 0;

  faqs.faqs.forEach(faq => {
    let score = 0;
    
    // Check how many keywords match
    faq.keywords.forEach(keyword => {
      userWords.forEach(word => {
        if (word.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(word)) {
          score++;
        }
      });
    });

    if (score > highestScore) {
      highestScore = score;
      bestMatch = faq;
    }
  });

  return { match: bestMatch, score: highestScore };
}

// Chat endpoint
app.post('/api/chat', (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || userMessage.trim() === '') {
    return res.json({ 
      reply: "Please ask me a question!",
      confidence: "none"
    });
  }

  const { match, score } = findBestMatch(userMessage);

  if (match && score > 0) {
    res.json({ 
      reply: match.answer,
      confidence: score > 2 ? "high" : "medium",
      faqId: match.id
    });
  } else {
    res.json({ 
      reply: "I'm not sure about that. Could you please contact us at support@rsce.com or visit our website for more information?",
      confidence: "low"
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RSCE Chatbot is running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
