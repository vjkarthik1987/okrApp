function chunkText(text, maxTokens = 500, overlap = 50) {
    const words = text.split(/\s+/);
    const chunks = [];

    for (let i = 0; i < words.length; i += (maxTokens - overlap)) {
        const chunk = words.slice(i, i + maxTokens).join(' ');
        if (chunk.trim()) chunks.push(chunk);
        if (i + maxTokens >= words.length) break;
    }

    return chunks;
}

module.exports = chunkText;
  