import type { Express, Request } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { createAuditLog, hashIP } from '../db/queries';
import {
  createBlogPost,
  deleteBlogPost,
  getBlogPostBySlugPublic,
  listBlogPostsAdmin,
  listBlogPostsPublic,
  updateBlogPost,
  type BlogPostStatus,
} from '../db/queries';

const slugify = (input: string): string => {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
};

const estimateReadingTime = (contentMd: string): string => {
  const words = contentMd
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[`*_#[\\]()>-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min`;
};

const adminCreateSchema = z.object({
  title: z.string().trim().min(1).max(140),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug').optional(),
  excerpt: z.string().trim().max(400).optional().default(''),
  contentMd: z.string().optional().default(''),
  author: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

const adminUpdateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug').optional(),
  excerpt: z.string().trim().max(400).optional(),
  contentMd: z.string().optional(),
  author: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(['draft', 'published']).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});

export function registerBlogRoutes(app: Express) {
  // Public: list published posts
  app.get('/api/blog/posts', (_req, res) => {
    const rows = listBlogPostsPublic();
    res.json({
      posts: rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        date: (row.published_at || row.updated_at || row.created_at).slice(0, 10),
        author: row.author || 'VoxDrop Team',
        category: row.category || 'Blog',
        readingTime: estimateReadingTime(row.content_md || ''),
      })),
    });
  });

  // Public: get a post by slug
  app.get('/api/blog/posts/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'Missing slug' });
    const row = getBlogPostBySlugPublic(slug);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({
      post: {
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        date: (row.published_at || row.updated_at || row.created_at).slice(0, 10),
        author: row.author || 'VoxDrop Team',
        category: row.category || 'Blog',
        readingTime: estimateReadingTime(row.content_md || ''),
        contentMd: row.content_md || '',
      },
    });
  });

  // Admin: list all posts (draft + published)
  app.get('/api/admin/blog/posts', requireAuth, requireAdmin, (req, res) => {
    const rows = listBlogPostsAdmin();
    res.json({ posts: rows });
    try {
      createAuditLog(req.userId!, 'blog_admin_list', 'success', '/api/admin/blog/posts', null, hashIP(req.ip || 'unknown'));
    } catch {
      // audit log should not block
    }
  });

  // Admin: create post
  app.post('/api/admin/blog/posts', requireAuth, requireAdmin, (req: Request, res) => {
    const ipHash = hashIP(req.ip || 'unknown');
    const parsed = adminCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      createAuditLog(req.userId!, 'blog_admin_create', 'failure', '/api/admin/blog/posts', { error: parsed.error.flatten() }, ipHash);
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const slug = parsed.data.slug || slugify(parsed.data.title) || `post-${Date.now()}`;
    try {
      const row = createBlogPost({
        slug,
        title: parsed.data.title,
        excerpt: parsed.data.excerpt,
        content_md: parsed.data.contentMd,
        author: parsed.data.author,
        category: parsed.data.category,
        status: parsed.data.status as BlogPostStatus,
      });
      createAuditLog(req.userId!, 'blog_admin_create', 'success', '/api/admin/blog/posts', { id: row.id, slug: row.slug }, ipHash);
      return res.status(201).json({ post: row });
    } catch (error: any) {
      const message = String(error?.message || error);
      createAuditLog(req.userId!, 'blog_admin_create', 'failure', '/api/admin/blog/posts', { error: message }, ipHash);
      if (message.includes('UNIQUE') || message.includes('unique')) {
        return res.status(409).json({ error: 'Slug already exists' });
      }
      return res.status(500).json({ error: 'Failed to create post' });
    }
  });

  // Admin: update post
  app.put('/api/admin/blog/posts/:id', requireAuth, requireAdmin, (req: Request, res) => {
    const ipHash = hashIP(req.ip || 'unknown');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const parsed = adminUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      createAuditLog(req.userId!, 'blog_admin_update', 'failure', '/api/admin/blog/posts/:id', { error: parsed.error.flatten() }, ipHash);
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    try {
      const row = updateBlogPost(id, {
        slug: parsed.data.slug,
        title: parsed.data.title,
        excerpt: parsed.data.excerpt,
        content_md: parsed.data.contentMd,
        author: parsed.data.author,
        category: parsed.data.category,
        status: parsed.data.status as BlogPostStatus | undefined,
        published_at: parsed.data.publishedAt,
      });
      createAuditLog(req.userId!, 'blog_admin_update', 'success', '/api/admin/blog/posts/:id', { id: row.id, slug: row.slug }, ipHash);
      return res.json({ post: row });
    } catch (error: any) {
      const message = String(error?.message || error);
      createAuditLog(req.userId!, 'blog_admin_update', 'failure', '/api/admin/blog/posts/:id', { error: message }, ipHash);
      if (message === 'blog_post_not_found') return res.status(404).json({ error: 'Not found' });
      if (message.includes('UNIQUE') || message.includes('unique')) return res.status(409).json({ error: 'Slug already exists' });
      return res.status(500).json({ error: 'Failed to update post' });
    }
  });

  // Admin: delete post
  app.delete('/api/admin/blog/posts/:id', requireAuth, requireAdmin, (req: Request, res) => {
    const ipHash = hashIP(req.ip || 'unknown');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    try {
      deleteBlogPost(id);
      createAuditLog(req.userId!, 'blog_admin_delete', 'success', '/api/admin/blog/posts/:id', { id }, ipHash);
      return res.status(204).end();
    } catch (error: any) {
      const message = String(error?.message || error);
      createAuditLog(req.userId!, 'blog_admin_delete', 'failure', '/api/admin/blog/posts/:id', { error: message }, ipHash);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  });
}
