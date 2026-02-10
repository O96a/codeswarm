#!/usr/bin/env node
/**
 * Test script for RuVectorMemory with Ollama embeddings
 * 
 * Usage: node test-embeddings.js
 */

const RuVectorMemory = require('./ruvector-memory');

async function testEmbeddings() {
    console.log('🧪 Testing RuVectorMemory with Ollama Embeddings\n');

    // Test 1: Initialize with Local Ollama (more likely to be available)
    console.log('Test 1: Initialize with Local Ollama API');
    const memory = new RuVectorMemory({
        ollama_url: 'http://localhost:11434',
        embedding_model: 'nomic-embed-text',
        dimSize: 384
    });

    await memory.initialize();
    console.log('Stats:', memory.getStats());
    console.log('');

    // Test 2: Generate embeddings
    console.log('Test 2: Generate embeddings for sample text');
    const testTexts = [
        'The coordinator found 3 critical bugs in the authentication module',
        'Performance issue detected in database queries',
        'Authentication module has security vulnerabilities'
    ];

    const embeddings = [];
    for (const text of testTexts) {
        console.log(`  Embedding: "${text.substring(0, 50)}..."`);
        const embedding = await memory.embed(text);
        embeddings.push({ text, embedding });
        console.log(`  ✓ Generated ${embedding.length}-dimensional vector`);
    }
    console.log('');

    // Test 3: Store and search
    console.log('Test 3: Store embeddings and perform semantic search');

    // Store first two embeddings
    await memory.store('finding-1', embeddings[0].embedding, {
        text: embeddings[0].text,
        type: 'bug',
        severity: 'critical'
    });
    await memory.store('finding-2', embeddings[1].embedding, {
        text: embeddings[1].text,
        type: 'performance',
        severity: 'medium'
    });
    console.log('  ✓ Stored 2 findings');

    // Search with third embedding (similar to first)
    console.log(`  Searching for: "${embeddings[2].text}"`);
    const results = await memory.search(embeddings[2].embedding, 2);
    console.log('  Results:');
    results.forEach((result, i) => {
        console.log(`    ${i + 1}. [Score: ${result.score.toFixed(3)}] ${result.metadata.text}`);
    });
    console.log('');

    // Test 4: Fallback behavior
    console.log('Test 4: Test fallback with invalid Ollama URL');
    const fallbackMemory = new RuVectorMemory({
        ollama_url: 'http://invalid:9999',
        embedding_model: 'nomic-embed-text',
        dimSize: 384
    });

    const fallbackEmbedding = await fallbackMemory.embed('test text for fallback');
    console.log(`  ✓ Fallback generated ${fallbackEmbedding.length}-dimensional vector`);
    console.log(`  ✓ Ollama status: ${fallbackMemory.ollamaAvailable}`);
    console.log('');

    console.log('✅ All tests completed!');
}

// Run tests
testEmbeddings().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
