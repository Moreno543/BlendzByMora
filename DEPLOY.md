# Deploy BlendzByMora to BlendzByMora.com

## Step 1: Push to GitHub

Run these commands in Terminal (from the BlendzByMora folder):

```bash
cd /Users/hectorsmac/BlendzByMora

# Initialize git
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit - Blendz By Mora website"

# Create repo on GitHub first, then:
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/BlendzByMora.git
git branch -M main
git push -u origin main
```

**Before pushing:** Create the repo on GitHub:
1. Go to [github.com/new](https://github.com/new)
2. Repository name: `BlendzByMora`
3. Choose **Public**
4. Don't add README (you already have files)
5. Click **Create repository**
6. Copy the repo URL and use it in the `git remote add origin` command above

---

## Step 2: Deploy & Add Custom Domain

### Option A: Netlify (Recommended - Free & Easy)

1. Go to [netlify.com](https://netlify.com) → Sign up with GitHub
2. Click **Add new site** → **Import an existing project**
3. Choose **GitHub** → Select `BlendzByMora` repo
4. Build settings: Leave default (no build command needed)
5. Publish directory: `./` (root)
6. Click **Deploy**
7. Your site will be live at `something-random.netlify.app`

**Add BlendzByMora.com:**
1. Buy the domain at [Namecheap](https://namecheap.com), [Google Domains](https://domains.google), or [Cloudflare](https://cloudflare.com)
2. In Netlify: **Site settings** → **Domain management** → **Add custom domain**
3. Enter `BlendzByMora.com`
4. Follow Netlify's instructions to update your domain's DNS (add the records they provide)

### Option B: GitHub Pages

1. In your GitHub repo: **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/ (root)`
4. Save — site will be at `YOUR_USERNAME.github.io/BlendzByMora`
5. For custom domain: Add `BlendzByMora.com` in Pages settings and configure DNS at your registrar

### Option C: Vercel

1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. **Add New** → **Project** → Import `BlendzByMora`
3. Deploy
4. **Settings** → **Domains** → Add `BlendzByMora.com`

---

## Domain Setup Summary

| Registrar | What to do |
|-----------|------------|
| **Namecheap** | Add CNAME record: `www` → `your-site.netlify.app` (or Vercel URL) |
| **Google Domains** | Add custom resource records as shown by Netlify/Vercel |
| **Cloudflare** | Add CNAME for `www` and A record for root domain |

Both Netlify and Vercel will show you the exact DNS records to add.
