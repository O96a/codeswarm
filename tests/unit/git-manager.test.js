const GitManager = require('../../git-manager');
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

// Mock simple-git
jest.mock('simple-git');

describe('GitManager', () => {
    let gitManager;
    let mockGit;

    beforeEach(() => {
        mockGit = {
            checkIsRepo: jest.fn(),
            status: jest.fn(),
            log: jest.fn(),
            branchLocal: jest.fn(),
            checkoutLocalBranch: jest.fn(),
            add: jest.fn(),
            commit: jest.fn(),
            catFile: jest.fn(),
            tags: jest.fn(),
            addTag: jest.fn(),
            reset: jest.fn(),
            diff: jest.fn()
        };

        simpleGit.mockReturnValue(mockGit);
        gitManager = new GitManager();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Repository Validation', () => {
        test('validates repository successfully', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);

            const result = await gitManager.validateRepository();
            expect(result).toBe(true);
            expect(mockGit.checkIsRepo).toHaveBeenCalled();
        });

        test('throws error if not a git repository', async () => {
            mockGit.checkIsRepo.mockResolvedValue(false);

            await expect(gitManager.validateRepository()).rejects.toThrow('Not a git repository');
        });
    });

    describe('Uncommitted Changes Detection', () => {
        test('detects uncommitted changes', async () => {
            mockGit.status.mockResolvedValue({
                modified: ['file1.js'],
                created: ['file2.js'],
                deleted: [],
                renamed: []
            });

            const result = await gitManager.hasUncommittedChanges();
            expect(result).toBe(true);
        });

        test('returns false when repository is clean', async () => {
            mockGit.status.mockResolvedValue({
                modified: [],
                created: [],
                deleted: [],
                renamed: []
            });

            const result = await gitManager.hasUncommittedChanges();
            expect(result).toBe(false);
        });
    });

    describe('Commit Detection', () => {
        test('detects existing commits', async () => {
            mockGit.log.mockResolvedValue({ total: 5 });

            const result = await gitManager.hasCommits();
            expect(result).toBe(true);
        });

        test('detects no commits', async () => {
            mockGit.log.mockResolvedValue({ total: 0 });

            const result = await gitManager.hasCommits();
            expect(result).toBe(false);
        });
    });

    describe('Snapshot Creation', () => {
        test('creates snapshot successfully', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.log.mockResolvedValue({
                total: 1,
                latest: { hash: 'abc123' }
            });
            mockGit.status.mockResolvedValue({ current: 'main' });
            mockGit.branchLocal.mockResolvedValue({ all: [] });

            const sessionId = 'test-session-123';
            const snapshot = await gitManager.createSnapshot(sessionId);

            expect(snapshot.branch).toBe(`mehaisi-session-${sessionId}`);
            expect(snapshot.commit).toBe('abc123');
            expect(snapshot.originalBranch).toBe('main');
            expect(mockGit.checkoutLocalBranch).toHaveBeenCalledWith(`mehaisi-session-${sessionId}`);
        });

        test('creates initial commit if no commits exist', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.log
                .mockResolvedValueOnce({ total: 0 })
                .mockResolvedValueOnce({ total: 1, latest: { hash: 'abc123' } });
            mockGit.status.mockResolvedValue({ current: 'main' });
            mockGit.branchLocal.mockResolvedValue({ all: [] });

            const snapshot = await gitManager.createSnapshot('test');

            expect(mockGit.add).toHaveBeenCalledWith('.');
            expect(mockGit.commit).toHaveBeenCalledWith('Initial commit for CodeSwarm');
        });

        test('uses existing branch if it already exists', async () => {
            const sessionId = 'test-session';
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.log.mockResolvedValue({
                total: 1,
                latest: { hash: 'abc123' }
            });
            mockGit.status.mockResolvedValue({ current: 'main' });
            mockGit.branchLocal.mockResolvedValue({
                all: [`mehaisi-session-${sessionId}`]
            });

            await gitManager.createSnapshot(sessionId);

            expect(mockGit.checkoutLocalBranch).not.toHaveBeenCalled();
        });
    });

    describe('Commit Operations', () => {
        test('gets current commit hash', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.log.mockResolvedValue({
                latest: { hash: 'abc123def456' }
            });

            const commit = await gitManager.getCurrentCommit();
            expect(commit).toBe('abc123def456');
        });

        test('throws error if no commits exist', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.log.mockResolvedValue({ latest: null });

            await expect(gitManager.getCurrentCommit()).rejects.toThrow('No commits found');
        });

        test('checks if commit exists', async () => {
            mockGit.catFile.mockResolvedValue('commit');

            const exists = await gitManager.commitExists('abc123');
            expect(exists).toBe(true);
            expect(mockGit.catFile).toHaveBeenCalledWith(['-t', 'abc123']);
        });

        test('returns false for non-existent commit', async () => {
            mockGit.catFile.mockRejectedValue(new Error('Not found'));

            const exists = await gitManager.commitExists('invalid');
            expect(exists).toBe(false);
        });
    });

    describe('Tag Operations', () => {
        test('creates new tag', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.tags.mockResolvedValue({ all: [] });

            await gitManager.createTag('v1.0.0');

            expect(mockGit.addTag).toHaveBeenCalledWith('v1.0.0');
        });

        test('skips creating tag if it already exists', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.tags.mockResolvedValue({ all: ['v1.0.0'] });

            await gitManager.createTag('v1.0.0');

            expect(mockGit.addTag).not.toHaveBeenCalled();
        });
    });

    describe('Rollback Operations', () => {
        test('rolls back to commit successfully', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.catFile.mockResolvedValue('commit');
            mockGit.status.mockResolvedValue({
                modified: [],
                created: [],
                deleted: [],
                renamed: []
            });

            await gitManager.rollbackToCommit('abc123');

            expect(mockGit.reset).toHaveBeenCalledWith(['--hard', 'abc123']);
        });

        test('throws error if commit does not exist', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.catFile.mockRejectedValue(new Error('Not found'));

            await expect(gitManager.rollbackToCommit('invalid')).rejects.toThrow('does not exist');
        });

        test('warns about uncommitted changes', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.catFile.mockResolvedValue('commit');
            mockGit.status.mockResolvedValue({
                modified: ['file.js'],
                created: [],
                deleted: [],
                renamed: []
            });

            await gitManager.rollbackToCommit('abc123');

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('Modified Files', () => {
        test('gets all modified files', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.status.mockResolvedValue({
                modified: ['file1.js', 'file2.js'],
                created: ['file3.js'],
                deleted: ['file4.js'],
                renamed: ['file5.js']
            });

            const files = await gitManager.getModifiedFiles();

            expect(files.modified).toEqual(['file1.js', 'file2.js']);
            expect(files.created).toEqual(['file3.js']);
            expect(files.deleted).toEqual(['file4.js']);
            expect(files.renamed).toEqual(['file5.js']);
            expect(files.all).toHaveLength(5);
        });
    });

    describe('Operation Logging', () => {
        test('logs git operations', () => {
            gitManager.logOperation('test-operation', { detail: 'value' });

            const log = gitManager.getOperationLog();
            expect(log).toHaveLength(1);
            expect(log[0].operation).toBe('test-operation');
            expect(log[0].details.detail).toBe('value');
            expect(log[0].timestamp).toBeDefined();
        });

        test('maintains operation history', async () => {
            mockGit.checkIsRepo.mockResolvedValue(true);
            mockGit.tags.mockResolvedValue({ all: [] });
            mockGit.catFile.mockResolvedValue('commit');
            mockGit.status.mockResolvedValue({
                modified: [],
                created: [],
                deleted: [],
                renamed: []
            });

            await gitManager.createTag('v1.0.0');
            await gitManager.rollbackToCommit('abc123');

            const log = gitManager.getOperationLog();
            expect(log.length).toBeGreaterThan(0);
        });
    });
});
