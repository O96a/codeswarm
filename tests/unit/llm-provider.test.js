const { LLMProvider, LLMProviderManager } = require('../../llm-provider');

// Mock provider classes for testing
class MockProvider extends LLMProvider {
    constructor(config, name = 'mock') {
        super(config);
        this.name = name;
        this.executeCalled = false;
        this.healthCheckCalled = false;
    }

    async execute(instructions, options = {}) {
        this.executeCalled = true;
        return {
            success: true,
            provider: this.name,
            instructions,
            options
        };
    }

    async healthCheck() {
        this.healthCheckCalled = true;
        return true;
    }

    getCapabilities() {
        return {
            streaming: true,
            maxContext: 8192,
            parallel: false,
            supportedModels: ['mock-model-1', 'mock-model-2']
        };
    }
}

class FailingProvider extends LLMProvider {
    async execute(instructions, options = {}) {
        throw new Error('Provider execution failed');
    }

    async healthCheck() {
        return false;
    }
}

describe('LLMProvider', () => {
    describe('Base Class', () => {
        test('constructor initializes with config', () => {
            const config = { model: 'test-model' };
            const provider = new LLMProvider(config);

            expect(provider.config).toEqual(config);
        });

        test('execute() throws error (abstract method)', async () => {
            const provider = new LLMProvider({});

            await expect(provider.execute('test')).rejects.toThrow('execute() must be implemented by provider subclass');
        });

        test('healthCheck() throws error (abstract method)', async () => {
            const provider = new LLMProvider({});

            await expect(provider.healthCheck()).rejects.toThrow('healthCheck() must be implemented by provider subclass');
        });

        test('getCapabilities() returns default structure', () => {
            const provider = new LLMProvider({});
            const capabilities = provider.getCapabilities();

            expect(capabilities).toEqual({
                streaming: false,
                maxContext: 0,
                parallel: false,
                supportedModels: []
            });
        });
    });

    describe('MockProvider Implementation', () => {
        test('can extend base class successfully', () => {
            const mockProvider = new MockProvider({});

            expect(mockProvider).toBeInstanceOf(LLMProvider);
            expect(mockProvider.name).toBe('mock');
        });

        test('execute() works in subclass', async () => {
            const mockProvider = new MockProvider({});
            const result = await mockProvider.execute('test instructions', { model: 'test' });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('mock');
            expect(result.instructions).toBe('test instructions');
            expect(mockProvider.executeCalled).toBe(true);
        });

        test('healthCheck() works in subclass', async () => {
            const mockProvider = new MockProvider({});
            const isHealthy = await mockProvider.healthCheck();

            expect(isHealthy).toBe(true);
            expect(mockProvider.healthCheckCalled).toBe(true);
        });

        test('getCapabilities() can be overridden', () => {
            const mockProvider = new MockProvider({});
            const capabilities = mockProvider.getCapabilities();

            expect(capabilities.streaming).toBe(true);
            expect(capabilities.maxContext).toBe(8192);
            expect(capabilities.supportedModels).toContain('mock-model-1');
        });
    });
});

describe('LLMProviderManager', () => {
    let manager;
    let mockProvider1;
    let mockProvider2;

    beforeEach(() => {
        const config = {
            llm: {
                default_provider: 'mock1'
            }
        };
        manager = new LLMProviderManager(config);
        mockProvider1 = new MockProvider({}, 'mock1');
        mockProvider2 = new MockProvider({}, 'mock2');
    });

    describe('Constructor', () => {
        test('initializes with config', () => {
            expect(manager.config).toBeDefined();
            expect(manager.defaultProvider).toBe('mock1');
        });

        test('uses default provider when not specified in config', () => {
            const managerWithoutDefault = new LLMProviderManager({});
            expect(managerWithoutDefault.defaultProvider).toBe('ollama-cloud');
        });

        test('initializes empty provider map', () => {
            expect(manager.providers).toBeInstanceOf(Map);
            expect(manager.providers.size).toBe(0);
        });
    });

    describe('Provider Registration', () => {
        test('registers a provider successfully', () => {
            manager.register('mock1', mockProvider1);

            expect(manager.providers.has('mock1')).toBe(true);
            expect(manager.providers.get('mock1')).toBe(mockProvider1);
        });

        test('registers multiple providers', () => {
            manager.register('mock1', mockProvider1);
            manager.register('mock2', mockProvider2);

            expect(manager.providers.size).toBe(2);
            expect(manager.providers.has('mock1')).toBe(true);
            expect(manager.providers.has('mock2')).toBe(true);
        });

        test('overwrites provider with same name', () => {
            const firstProvider = new MockProvider({}, 'first');
            const secondProvider = new MockProvider({}, 'second');

            manager.register('test', firstProvider);
            manager.register('test', secondProvider);

            expect(manager.providers.size).toBe(1);
            expect(manager.providers.get('test')).toBe(secondProvider);
            expect(manager.providers.get('test').name).toBe('second');
        });
    });

    describe('Provider Retrieval', () => {
        beforeEach(() => {
            manager.register('mock1', mockProvider1);
            manager.register('mock2', mockProvider2);
        });

        test('gets provider by name', () => {
            const provider = manager.getProvider('mock1');

            expect(provider).toBe(mockProvider1);
        });

        test('gets default provider when name not specified', () => {
            const provider = manager.getProvider();

            expect(provider).toBe(mockProvider1);
        });

        test('throws error for non-existent provider', () => {
            expect(() => {
                manager.getProvider('non-existent');
            }).toThrow('Provider not found: non-existent');
        });

        test('throws error when default provider not registered', () => {
            const emptyManager = new LLMProviderManager({ llm: { default_provider: 'missing' } });

            expect(() => {
                emptyManager.getProvider();
            }).toThrow('Provider not found: missing');
        });
    });

    describe('Execute Method', () => {
        beforeEach(() => {
            manager.register('mock1', mockProvider1);
            manager.register('mock2', mockProvider2);
        });

        test('executes with default provider', async () => {
            const result = await manager.execute('test instructions');

            expect(result.success).toBe(true);
            expect(result.provider).toBe('mock1');
            expect(mockProvider1.executeCalled).toBe(true);
        });

        test('executes with specified provider', async () => {
            const result = await manager.execute('test instructions', { provider: 'mock2' });

            expect(result.success).toBe(true);
            expect(result.provider).toBe('mock2');
            expect(mockProvider2.executeCalled).toBe(true);
        });

        test('passes options to provider', async () => {
            const options = { provider: 'mock1', model: 'custom-model', temperature: 0.7 };
            const result = await manager.execute('test', options);

            expect(result.options).toEqual(options);
        });

        test('throws error when provider execution fails', async () => {
            const failingProvider = new FailingProvider({});
            manager.register('failing', failingProvider);

            await expect(manager.execute('test', { provider: 'failing' }))
                .rejects.toThrow('Provider execution failed');
        });
    });

    describe('Health Check All', () => {
        test('checks health of all registered providers', async () => {
            manager.register('mock1', mockProvider1);
            manager.register('mock2', mockProvider2);

            const results = await manager.healthCheckAll();

            expect(results).toHaveProperty('mock1', true);
            expect(results).toHaveProperty('mock2', true);
            expect(mockProvider1.healthCheckCalled).toBe(true);
            expect(mockProvider2.healthCheckCalled).toBe(true);
        });

        test('handles failing health checks gracefully', async () => {
            const failingProvider = new FailingProvider({});
            manager.register('mock1', mockProvider1);
            manager.register('failing', failingProvider);

            const results = await manager.healthCheckAll();

            expect(results.mock1).toBe(true);
            expect(results.failing).toBe(false);
        });

        test('returns empty object when no providers registered', async () => {
            const results = await manager.healthCheckAll();

            expect(results).toEqual({});
        });

        test('continues checking other providers after one fails', async () => {
            const errorProvider = new MockProvider({}, 'error');
            errorProvider.healthCheck = jest.fn().mockRejectedValue(new Error('Health check failed'));

            manager.register('error', errorProvider);
            manager.register('mock1', mockProvider1);

            const results = await manager.healthCheckAll();

            expect(results.error).toBe(false);
            expect(results.mock1).toBe(true);
        });
    });

    describe('Get All Capabilities', () => {
        test('returns capabilities for all providers', () => {
            manager.register('mock1', mockProvider1);
            manager.register('mock2', mockProvider2);

            const capabilities = manager.getAllCapabilities();

            expect(capabilities).toHaveProperty('mock1');
            expect(capabilities).toHaveProperty('mock2');
            expect(capabilities.mock1.streaming).toBe(true);
            expect(capabilities.mock2.streaming).toBe(true);
        });

        test('returns empty object when no providers registered', () => {
            const capabilities = manager.getAllCapabilities();

            expect(capabilities).toEqual({});
        });

        test('includes all capability fields', () => {
            manager.register('mock1', mockProvider1);

            const capabilities = manager.getAllCapabilities();

            expect(capabilities.mock1).toHaveProperty('streaming');
            expect(capabilities.mock1).toHaveProperty('maxContext');
            expect(capabilities.mock1).toHaveProperty('parallel');
            expect(capabilities.mock1).toHaveProperty('supportedModels');
        });
    });
});
