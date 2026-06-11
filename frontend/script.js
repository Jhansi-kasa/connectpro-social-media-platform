// ─────────────────────────────────────────────────────────────────────────────
// ConnectPro — script.js
// All UI logic wired to real backend via api-client.js (ConnectPro.*)
// ─────────────────────────────────────────────────────────────────────────────

const API  = window.ConnectPro;
let currentUser   = null;
let feedPage      = 1;
let feedMode      = 'home';   // 'home' | 'explore'
let exploreTab    = 'posts';  // 'posts' | 'people'
let activeConvId  = null;
let activeConvUser = null;
let profileTarget = null;     // username of currently viewed profile

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) { window.location.href = 'index.html'; return; }

    try {
        currentUser = await API.Auth.getMe();
    } catch (_) {
        window.location.href = 'index.html'; return;
    }

    // Set header avatar
    const headerAvatar = document.getElementById('header-avatar');
    if (currentUser.avatar?.url) headerAvatar.src = currentUser.avatar.url;
    else headerAvatar.src = avatarUrl(currentUser);

    // Connect realtime socket
    if (API.initSocket) API.initSocket();

    // Load everything
    await Promise.all([
        loadFeed(),
        loadConversations(),
        loadNotifications(),
        loadNotifBadge(),
    ]);

    // Wire search
    const searchBar = document.getElementById('search-bar');
    let searchTimeout;
    searchBar.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        if (!searchBar.value.trim()) { closeSearch(); return; }
        searchTimeout = setTimeout(() => liveSearch(searchBar.value.trim()), 400);
    });
    searchBar.addEventListener('keypress', (e) => { if (e.key === 'Enter') doSearch(); });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search')) closeSearch();
    });

    // Socket events
    document.addEventListener('notification:new', (e) => {
        prependNotification(e.detail);
        loadNotifBadge();
    });
    document.addEventListener('message:new', (e) => {
        const msg = e.detail;
        const me = String(currentUser?._id || currentUser?.id || '');
        const senderId = String(msg.sender?._id || msg.sender || '');
        // Skip if this is our own message (already appended optimistically on send)
        if (msg.conversation === activeConvId && senderId !== me) {
            appendChatMessage(msg, false);
        }
        loadConversations();
    });
    document.addEventListener('typing:start', (e) => {
        if (e.detail.conversationId === activeConvId) showTyping(e.detail.username);
    });
    document.addEventListener('typing:stop', (e) => {
        if (e.detail.conversationId === activeConvId) hideTyping();
    });
    document.addEventListener('user:status', (e) => {
        updateChatStatus(e.detail);
    });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function avatarUrl(user, size = 40) {
    return user?.avatar?.url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=random&size=${size}`;
}
function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
}
function esc(str = '') {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}
function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'cp-toast';
    el.textContent = msg;
    el.style.background = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#22c55e';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}
function showPanel(panelId) {
    ['main-content','notifications','messages','chat',
     'profilecard','post-creation','settings-container'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === panelId) {
            el.classList.remove('hide');
            if (id === 'chat') el.style.display = 'flex';
        } else {
            el.classList.add('hide');
            if (id === 'chat') el.style.display = 'none';
        }
    });
}
function hideSidebarOnMobile() {
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hide');
        document.getElementById('sidebar').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
    }
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('hide');
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('hide');
    }
}
function closeSidebar() {
    document.getElementById('sidebar').classList.add('hide');
    document.getElementById('sidebar').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
}

// ─── THEME ────────────────────────────────────────────────────────────────────
function themes() {
    document.querySelector('body').classList.toggle('theme');
    hideSidebarOnMobile();
}

// ══════════════════════════════════════════════════════════════════════════════
// FEED
// ══════════════════════════════════════════════════════════════════════════════
async function loadFeed(reset = true) {
    if (reset) { feedPage = 1; feedMode = 'home'; }
    document.getElementById('explore-tabs').style.display = 'none';

    const container = document.getElementById('feed-container');
    if (reset) container.innerHTML = '<div class="spinner"><i class="fa-solid fa-spinner"></i> Loading feed...</div>';

    try {
        const res = await API.Feed.getHome(feedPage);
        renderFeedPosts(res.data.posts, reset, res.meta);
    } catch (_) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-house"></i><p>Could not load feed.</p></div>';
    }
}

async function loadMoreFeed() {
    feedPage++;
    if (feedMode === 'home') {
        const res = await API.Feed.getHome(feedPage);
        renderFeedPosts(res.data.posts, false, res.meta);
    } else {
        const res = await API.Feed.getExplore(feedPage);
        renderFeedPosts(res.data.posts, false, res.meta);
    }
}

function renderFeedPosts(posts, reset, meta) {
    const container = document.getElementById('feed-container');
    if (reset) container.innerHTML = '';

    if (!posts.length && reset) {
        container.innerHTML = `<div class="empty-state">
            <i class="fa-solid fa-rss"></i>
            <p>${feedMode === 'home' ? 'Follow people to see their posts here.' : 'No posts yet.'}</p>
        </div>`;
        document.getElementById('load-more-wrap').style.display = 'none';
        return;
    }

    posts.forEach(post => container.insertAdjacentHTML('beforeend', buildPostCard(post)));
    document.getElementById('load-more-wrap').style.display = meta?.hasNextPage ? 'block' : 'none';
}

function buildPostCard(post) {
    const author  = post.author || {};
    const isOwn   = author._id === currentUser?._id || author._id === currentUser?.id;
    const liked   = post.isLiked;
    const saved   = post.isSaved;
    const content = post.content ? `<p style="font-size:0.9rem; padding:4px 0; line-height:1.5;">${formatContent(post.content)}</p>` : '';
    const media   = post.media?.length
        ? `<img src="${post.media[0].url}" class="post-image" style="cursor:pointer;" onclick="openPostImage('${post.media[0].url}')">`
        : '';
    const repostBanner = post.type === 'repost'
        ? `<p style="font-size:0.78rem; color:#888; margin-bottom:4px;"><i class="fa-solid fa-retweet"></i> Reposted</p>` : '';

    return `
    <div class="post-wrapper">
      <div class="post-container" data-post-id="${post._id}">
        ${repostBanner}
        <div class="post-header">
            <img src="${avatarUrl(author)}" class="post-profile-image" style="cursor:pointer;"
                onclick="openUserProfile('${author.username}')">
            <div class="post-user-info" style="cursor:pointer;" onclick="openUserProfile('${author.username}')">
                <h3>${esc(author.name || 'User')}</h3>
                <p>@${esc(author.username || '')} · ${timeAgo(post.createdAt)}</p>
            </div>
            <button onclick="togglePostMenu('${post._id}')" style="background:none; border:none; cursor:pointer; margin-left:auto; padding:4px 8px;">
                <i class="fa-solid fa-ellipsis"></i>
            </button>
        </div>
        <!-- Post actions menu -->
        <div class="post-actions-menu" id="menu-${post._id}">
            ${isOwn ? `
            <button onclick="editPost('${post._id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            <button onclick="deletePost('${post._id}')" class="danger"><i class="fa-solid fa-trash"></i> Delete</button>
            <button onclick="togglePin('${post._id}')"><i class="fa-solid fa-thumbtack"></i> ${post.isPinned ? 'Unpin' : 'Pin'}</button>
            ` : `
            <button onclick="reportPost('${post._id}')"><i class="fa-solid fa-flag"></i> Report</button>
            `}
            <button onclick="copyPostLink('${post._id}')"><i class="fa-solid fa-link"></i> Copy link</button>
        </div>
        ${content}
        ${media}
        <div class="post-footer">
            <button onclick="toggleLike('${post._id}', this)" data-liked="${liked}">
                <i class="fa-${liked ? 'solid' : 'regular'} fa-heart like icon ${liked ? 'active' : ''}"></i>
            </button>
            <span style="font-size:0.82rem; color:#888;" id="likes-${post._id}">${post.likesCount || 0}</span>
            <button onclick="openComments('${post._id}')">
                <i class="fa-regular fa-message icon"></i>
            </button>
            <span style="font-size:0.82rem; color:#888;">${post.commentsCount || 0}</span>
            <button onclick="repostPost('${post._id}')">
                <i class="fa-solid fa-retweet icon"></i>
            </button>
            <span style="font-size:0.82rem; color:#888;">${post.sharesCount || 0}</span>
            <button onclick="toggleSave('${post._id}', this)" data-saved="${saved}" style="margin-left:auto;">
                <i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark icon" style="${saved ? 'color:blue' : ''}"></i>
            </button>
        </div>
      </div>
    </div>`;
}

function formatContent(text) {
    return esc(text)
        .replace(/#(\w+)/g, '<span style="color:blue; cursor:pointer;" onclick="searchHashtag(\'$1\')">#$1</span>')
        .replace(/@(\w+)/g, '<span style="color:blue; cursor:pointer;" onclick="openUserProfile(\'$1\')">@$1</span>');
}

function togglePostMenu(postId) {
    document.querySelectorAll('.post-actions-menu').forEach(m => {
        if (m.id !== `menu-${postId}`) m.classList.remove('show');
    });
    document.getElementById(`menu-${postId}`)?.classList.toggle('show');
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-wrapper')) {
        document.querySelectorAll('.post-actions-menu').forEach(m => m.classList.remove('show'));
    }
});

// ── LIKE ──────────────────────────────────────────────────────────────────────
async function toggleLike(postId, btn) {
    try {
        const res = await API.Posts.toggleLike(postId);
        const icon = btn.querySelector('i');
        icon.className = `fa-${res.liked ? 'solid' : 'regular'} fa-heart like icon ${res.liked ? 'active' : ''}`;
        btn.dataset.liked = res.liked;
        const countEl = document.getElementById(`likes-${postId}`);
        if (countEl) countEl.textContent = res.likesCount;
    } catch (_) { toast('Failed to like post.', 'error'); }
}

// ── SAVE ──────────────────────────────────────────────────────────────────────
async function toggleSave(postId, btn) {
    try {
        const res = await API.Posts.toggleSave(postId);
        const icon = btn.querySelector('i');
        icon.className = `fa-${res.saved ? 'solid' : 'regular'} fa-bookmark icon`;
        icon.style.color = res.saved ? 'blue' : '';
        btn.dataset.saved = res.saved;
        toast(res.saved ? 'Post saved!' : 'Post unsaved.');
    } catch (_) {}
}

// ── DELETE POST ───────────────────────────────────────────────────────────────
async function deletePost(postId) {
    if (!confirm('Delete this post?')) return;
    try {
        await API.Posts.delete(postId);
        document.querySelector(`[data-post-id="${postId}"]`)?.closest('.post-wrapper')?.remove();
        toast('Post deleted.');
    } catch (e) { toast(e.message, 'error'); }
}

// ── EDIT POST ─────────────────────────────────────────────────────────────────
async function editPost(postId) {
    const postEl = document.querySelector(`[data-post-id="${postId}"] .post-user-info`);
    const currentContent = document.querySelector(`[data-post-id="${postId}"] p`)?.textContent || '';
    const newContent = prompt('Edit your post:', currentContent);
    if (!newContent || newContent === currentContent) return;
    try {
        await API.Posts.update(postId, newContent);
        toast('Post updated!');
        loadFeed();
    } catch (e) { toast(e.message, 'error'); }
}

// ── REPOST ────────────────────────────────────────────────────────────────────
async function repostPost(postId) {
    const quote = prompt('Add a comment (optional, leave empty to repost):');
    if (quote === null) return; // cancelled
    try {
        await API.Posts.repost(postId, quote);
        toast(quote ? 'Quote posted!' : 'Reposted!');
        loadFeed();
    } catch (e) { toast(e.message, 'error'); }
}

// ── PIN ───────────────────────────────────────────────────────────────────────
async function togglePin(postId) {
    try {
        const res = await API.Posts.togglePin(postId);
        toast(res.isPinned ? 'Post pinned!' : 'Post unpinned.');
        loadFeed();
    } catch (e) { toast(e.message, 'error'); }
}

// ── REPORT ────────────────────────────────────────────────────────────────────
async function reportPost(postId) {
    const reason = prompt('Reason for report:\n(spam / harassment / hate_speech / violence / nudity / false_information / scam / other)');
    if (!reason) return;
    try {
        await API.Reports.create(postId, 'Post', reason);
    } catch (e) { toast(e.message, 'error'); }
}

function copyPostLink(postId) {
    navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
    toast('Link copied!');
}

function openPostImage(url) {
    window.open(url, '_blank');
}

// ── COMMENTS ─────────────────────────────────────────────────────────────────
async function openComments(postId) {
    const comments = await API.Posts.getComments(postId);
    let html = `<div style="background:white; border-radius:12px; padding:1rem; max-height:60vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.2); min-width:300px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <strong>Comments</strong>
            <button onclick="this.closest('.comment-overlay').remove()" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">&times;</button>
        </div>`;

    if (!comments.data?.comments?.length) {
        html += '<p style="color:#aaa; text-align:center; padding:1rem;">No comments yet. Be the first!</p>';
    } else {
        comments.data.comments.forEach(c => {
            html += `<div style="display:flex; gap:10px; margin-bottom:12px;">
                <img src="${avatarUrl(c.author)}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                <div style="flex:1; background:#f5f5f5; border-radius:10px; padding:8px 12px;">
                    <strong style="font-size:0.85rem;">${esc(c.author?.name)}</strong>
                    <p style="font-size:0.88rem; margin:2px 0;">${esc(c.content)}</p>
                    <small style="color:#aaa;">${timeAgo(c.createdAt)}</small>
                </div>
            </div>`;
        });
    }

    html += `<div style="display:flex; gap:8px; margin-top:1rem;">
        <input type="text" id="comment-input-${postId}" placeholder="Write a comment..."
            style="flex:1; padding:8px 12px; border-radius:20px; border:1.5px solid #ddd; outline:none; font-size:0.88rem;"
            onkeypress="if(event.key==='Enter') submitComment('${postId}')">
        <button onclick="submitComment('${postId}')"
            style="background:blue; color:white; border:none; border-radius:20px; padding:8px 16px; cursor:pointer; font-size:0.85rem;">
            Post
        </button>
    </div></div>`;

    const overlay = document.createElement('div');
    overlay.className = 'comment-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:1000; padding:1rem;';
    overlay.innerHTML = html;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

async function submitComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    try {
        await API.Posts.createComment(postId, content);
        input.value = '';
        document.querySelector('.comment-overlay')?.remove();
        toast('Comment posted!');
        loadFeed();
    } catch (e) { toast(e.message, 'error'); }
}

// ── CREATE POST ───────────────────────────────────────────────────────────────
let postFiles = [];

function pickPostFile() {
    document.getElementById('post-file-input').click();
}
function previewPostFile(input) {
    const file = input.files[0];
    if (!file) return;
    postFiles = [file];
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('post-preview-img').src = e.target.result;
        document.getElementById('post-image-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
}
function clearPostImage() {
    postFiles = [];
    document.getElementById('post-file-input').value = '';
    document.getElementById('post-image-preview').style.display = 'none';
}

async function submitPost() {
    const content    = document.getElementById('post-text').value.trim();
    const visibility = document.getElementById('post-visibility').value;
    if (!content && !postFiles.length) { toast('Post cannot be empty.', 'error'); return; }

    try {
        await API.Posts.create(content, postFiles, visibility);
        document.getElementById('post-text').value = '';
        clearPostImage();
        showPanel('main-content');
        await loadFeed();
        toast('Post created!');
    } catch (e) { toast(e.message, 'error'); }
}

// ─── NAVIGATION FUNCTIONS ──────────────────────────────────────────────────────
function explore() { showExplore(); hideSidebarOnMobile(); }
function notify()  { showNotifications(); hideSidebarOnMobile(); }
function message() { showMessages(); hideSidebarOnMobile(); }
function postcreate() {
    showPanel('post-creation');
    hideSidebarOnMobile();
}

async function showExplore() {
    feedMode = 'explore';
    feedPage = 1;
    showPanel('main-content');
    document.getElementById('explore-tabs').style.display = 'block';
    hideSidebarOnMobile();

    if (exploreTab === 'posts') {
        await loadExplorePosts();
    } else {
        await loadExplorePeople();
    }
}

async function loadExplorePosts() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="spinner"><i class="fa-solid fa-spinner"></i> Loading...</div>';
    try {
        const res = await API.Feed.getExplore(1);
        renderFeedPosts(res.data.posts, true, res.meta);
    } catch (_) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-compass"></i><p>Could not load posts.</p></div>';
    }
}

async function loadExplorePeople() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="spinner"><i class="fa-solid fa-spinner"></i> Loading people...</div>';
    try {
        const users = await API.Users.getSuggestions(20);
        if (!users.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users"></i><p>No suggestions yet.</p></div>';
            return;
        }
        container.innerHTML = users.map(u => `
            <div style="display:flex; align-items:center; gap:12px; padding:12px;
                background:#f0f0f0; border-radius:12px; margin-bottom:8px;">
                <img src="${avatarUrl(u)}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; cursor:pointer;"
                    onclick="openUserProfile('${u.username}')">
                <div style="flex:1; cursor:pointer;" onclick="openUserProfile('${u.username}')">
                    <strong style="display:block;">${esc(u.name)}</strong>
                    <span style="font-size:0.82rem; color:#888;">@${esc(u.username)} · ${u.followersCount || 0} followers</span>
                    ${u.bio ? `<p style="font-size:0.8rem; color:#555; margin:2px 0;">${esc(u.bio)}</p>` : ''}
                </div>
                <button class="followbtn" style="padding:6px 16px; border-radius:20px;"
                    onclick="quickFollow('${u._id}', this)">Follow</button>
            </div>`).join('');
    } catch (_) {}
}

async function switchExploreTab(tab, btn) {
    exploreTab = tab;
    document.querySelectorAll('.explore-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (tab === 'posts') await loadExplorePosts();
    else await loadExplorePeople();
}

async function quickFollow(userId, btn) {
    try {
        const res = await API.Follows.toggle(userId);
        btn.textContent = res.following ? 'Following' : res.pending ? 'Requested' : 'Follow';
        btn.className = `followbtn ${res.following ? 'following' : res.pending ? 'pending' : ''}`;
        btn.style.padding = '6px 16px';
        btn.style.borderRadius = '20px';
    } catch (e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════
async function showNotifications() {
    showPanel('notifications');
    await loadNotifications();
}

async function loadNotifications() {
    const container = document.getElementById('notifications-list');
    try {
        const res = await API.Notifications.getAll();
        const notifs = res.data?.notifications || [];
        if (!notifs.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><p>No notifications yet.</p></div>';
            return;
        }
        container.innerHTML = notifs.map(n => buildNotifItem(n)).join('');
    } catch (_) {
        container.innerHTML = '<p style="color:#aaa; text-align:center; padding:1rem;">Could not load notifications.</p>';
    }
}

function buildNotifItem(n) {
    const sender = n.sender || {};
    const msgs = {
        like:         'liked your post.',
        comment:      'commented on your post.',
        follow:       'started following you.',
        follow_request: 'sent you a follow request.',
        mention:      'mentioned you in a post.',
        reply:        'replied to your comment.',
        repost:       'reposted your post.',
        message:      'sent you a message.',
    };

    const isRequest = n.type === 'follow_request';
    return `
    <div class="notification-item ${n.isRead ? '' : 'unread'}" id="notif-${n._id}"
        onclick="markNotifRead('${n._id}')">
        <div style="display:flex; align-items:center; gap:10px; padding:8px;">
            <img src="${avatarUrl(sender)}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; cursor:pointer;"
                onclick="event.stopPropagation(); openUserProfile('${sender.username}')">
            <div style="flex:1;">
                <strong style="font-size:0.88rem;">${esc(sender.name || 'Someone')}</strong>
                <p style="font-size:0.82rem; color:#555; margin:2px 0;">${msgs[n.type] || 'New notification.'}</p>
                <small style="color:#aaa; font-size:0.75rem;">${timeAgo(n.createdAt)}</small>
            </div>
            ${isRequest ? `
            <div style="display:flex; gap:6px;">
                <button class="accept-button" style="padding:5px 10px; border-radius:8px; font-size:0.8rem;"
                    onclick="event.stopPropagation(); acceptFollow('${sender._id}', '${n._id}')">Accept</button>
                <button class="decline-button" style="padding:5px 10px; border-radius:8px; font-size:0.8rem;"
                    onclick="event.stopPropagation(); declineFollow('${sender._id}', '${n._id}')">Decline</button>
            </div>` : ''}
        </div>
    </div>`;
}

function prependNotification(n) {
    const container = document.getElementById('notifications-list');
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) container.innerHTML = '';
    container.insertAdjacentHTML('afterbegin', buildNotifItem(n));
}

async function markNotifRead(id) {
    await API.Notifications.markRead(id);
    document.getElementById(`notif-${id}`)?.classList.remove('unread');
    loadNotifBadge();
}

async function markAllNotifRead() {
    await API.Notifications.markAllRead();
    document.querySelectorAll('.notification-item').forEach(el => el.classList.remove('unread'));
    document.getElementById('notif-badge').classList.remove('show');
}

async function loadNotifBadge() {
    try {
        const count = await API.Notifications.getUnreadCount();
        const badge = document.getElementById('notif-badge');
        badge.textContent = count;
        count > 0 ? badge.classList.add('show') : badge.classList.remove('show');
    } catch (_) {}
}

async function acceptFollow(followerId, notifId) {
    try {
        await API.Follows.acceptRequest(followerId);
        document.getElementById(`notif-${notifId}`)?.remove();
        toast('Follow request accepted!');
        loadNotifBadge();
    } catch (e) { toast(e.message, 'error'); }
}

async function declineFollow(followerId, notifId) {
    try {
        await API.Follows.declineRequest(followerId);
        document.getElementById(`notif-${notifId}`)?.remove();
        toast('Follow request declined.');
    } catch (e) { toast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// MESSAGES / CONVERSATIONS
// ══════════════════════════════════════════════════════════════════════════════
async function showMessages() {
    showPanel('messages');
    await loadConversations();
}

async function loadConversations() {
    const container = document.getElementById('conversations-list');
    try {
        const convs = await API.Messages.getConversations();
        if (!convs.length) {
            container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-paper-plane"></i><p>No messages yet.</p></div>';
            return;
        }
        container.innerHTML = convs.map(c => buildConvItem(c)).join('');
    } catch (_) {}
}

function buildConvItem(conv) {
    const me    = currentUser?._id || currentUser?.id;
    const other = conv.otherParticipants?.[0] || conv.participants?.find(p => p._id !== me) || {};
    const lastMsg = conv.lastMessage?.content || 'Start a conversation';
    const isOnline = other.isOnline;

    return `
    <div class="message-item">
        <button onclick="openConversation('${conv._id}', '${other._id}', '${esc(other.name)}', '${avatarUrl(other)}', '${other.username}')">
            <div class="msg-avatar-wrap">
                <img src="${avatarUrl(other)}" class="message-profile-image">
                ${isOnline ? '<div class="online-dot"></div>' : ''}
            </div>
            <div class="message-info">
                <h4>${esc(other.name || 'User')}</h4>
                <p>${esc(lastMsg.substring(0, 40))}${lastMsg.length > 40 ? '...' : ''}</p>
            </div>
        </button>
    </div>`;
}

async function openConversation(convId, userId, name, avatar, username) {
    activeConvId   = convId;
    activeConvUser = { _id: userId, name, avatar, username };

    // Update chat header
    document.getElementById('chat-avatar').src = avatar;
    document.getElementById('chat-name').textContent = name;
    document.getElementById('chat-status').textContent = '';

    // Show chat panel
    document.getElementById('messages').classList.add('hide');
    const chat = document.getElementById('chat');
    chat.classList.remove('hide');
    chat.style.display = 'flex';

    // Load messages
    await loadChatMessages(convId);

    // Join socket room
    if (API.joinConversation) API.joinConversation(convId);
}

async function loadChatMessages(convId) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="spinner"><i class="fa-solid fa-spinner"></i></div>';
    try {
        const res = await API.Messages.getMessages(convId);
        const msgs = res.data?.messages || [];
        container.innerHTML = '';
        const me = String(currentUser?._id || currentUser?.id || '');
        msgs.forEach(msg => {
            const senderId = String(msg.sender?._id || msg.sender || '');
            appendChatMessage(msg, senderId === me);
        });
        container.scrollTop = container.scrollHeight;
    } catch (_) {
        container.innerHTML = '<p style="text-align:center; color:#aaa; padding:1rem;">Could not load messages.</p>';
    }
}

function appendChatMessage(msg, isMine) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const me = String(currentUser?._id || currentUser?.id || '');
    if (isMine === undefined) {
        const senderId = String(msg.sender?._id || msg.sender || '');
        isMine = senderId === me;
    }

    const div = document.createElement('div');
    div.style.cssText = `display:flex; flex-direction:column; align-items:${isMine ? 'flex-end' : 'flex-start'};`;
    div.dataset.msgId = msg._id;

    if (msg.isDeleted) {
        div.innerHTML = `<span class="msg-deleted">Message deleted</span>`;
    } else {
        div.innerHTML = `
            <div class="msg-bubble ${isMine ? 'msg-mine' : 'msg-theirs'}">
                ${msg.content ? esc(msg.content) : ''}
                ${msg.media?.url ? `<br><img src="${msg.media.url}" style="max-width:180px; border-radius:8px; margin-top:4px;">` : ''}
            </div>
            <span class="msg-time">${timeAgo(msg.createdAt)}</span>`;

        // Long-press to delete own messages
        if (isMine) {
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (confirm('Delete this message?')) deleteMessage(msg._id, div);
            });
        }
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !activeConvId) return;
    input.value = '';
    try {
        const msg = await API.Messages.send(activeConvId, content);
        appendChatMessage(msg, true);
        loadConversations();
    } catch (e) { toast(e.message, 'error'); }
}

function chatKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
    else if (API.emitTyping && activeConvId) API.emitTyping(activeConvId);
}

function pickChatFile() {
    document.getElementById('chat-file-input').click();
}

async function sendFileMessage() {
    const file = document.getElementById('chat-file-input').files[0];
    if (!file || !activeConvId) return;
    try {
        toast('Sending...', 'warning');
        await API.Messages.send(activeConvId, '', file);
        await loadChatMessages(activeConvId);
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteMessage(msgId, el) {
    try {
        await API.Messages.deleteMessage(msgId);
        el.innerHTML = '<span class="msg-deleted">Message deleted</span>';
    } catch (e) { toast(e.message, 'error'); }
}

function showTyping(username) {
    const el = document.getElementById('typing-indicator');
    document.getElementById('typing-name').textContent = username;
    el.style.display = 'block';
}
function hideTyping() {
    document.getElementById('typing-indicator').style.display = 'none';
}
function updateChatStatus(data) {
    if (activeConvUser && data.userId === activeConvUser._id) {
        document.getElementById('chat-status').textContent = data.isOnline ? 'Online' : `Last seen ${timeAgo(data.lastSeen)}`;
    }
}

function goBack() {
    activeConvId = null;
    document.getElementById('chat').classList.add('hide');
    document.getElementById('chat').style.display = 'none';
    document.getElementById('messages').classList.remove('hide');
}

function newMessage() {
    const username = prompt('Enter username to message:');
    if (!username) return;
    messageUsername(username);
}

async function messageUsername(username) {
    try {
        const user = await API.Users.getProfile(username);
        const conv = await API.Messages.getOrCreate(user._id);
        showMessages();
        setTimeout(() => openConversation(conv._id, user._id, user.name, avatarUrl(user), user.username), 300);
    } catch (e) { toast('User not found.', 'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE CARD
// ══════════════════════════════════════════════════════════════════════════════
async function profileview() {
    // Show own profile
    if (currentUser) await openUserProfile(currentUser.username);
}

async function openUserProfile(username) {
    profileTarget = username;
    showPanel('profilecard');
    hideSidebarOnMobile();

    // Reset
    document.getElementById('profilecard-name').textContent    = 'Loading...';
    document.getElementById('profilecard-username').textContent = '';
    document.getElementById('profilecard-bio').textContent     = '';
    document.getElementById('profilecard-posts-grid').innerHTML = '<div class="no-posts"><i class="fa-solid fa-spinner fa-spin"></i></div>';

    try {
        const user = await API.Users.getProfile(username);
        const me   = currentUser?._id || currentUser?.id;
        const isMe = user._id === me || user.id === me;

        // Fill card
        document.getElementById('profilecard-avatar').src   = avatarUrl(user, 100);
        document.getElementById('profilecard-name').textContent     = user.name || '';
        document.getElementById('profilecard-username').textContent = `@${user.username}`;
        document.getElementById('profilecard-bio').textContent      = user.bio || '';
        document.getElementById('profilecard-posts').textContent     = user.postsCount || 0;
        document.getElementById('profilecard-followers').textContent = user.followersCount || 0;
        document.getElementById('profilecard-following').textContent = user.followingCount || 0;

        // Buttons
        const btns = document.getElementById('profilecard-btns');
        if (isMe) {
            btns.innerHTML = `<button class="followbtn" onclick="window.location.href='settings.html'">
                <i class="fa-solid fa-pen"></i> Edit Profile</button>`;
        } else {
            const followBtn = document.getElementById('follow-btn') || document.createElement('button');
            followBtn.id = 'follow-btn';
            followBtn.className = `followbtn ${user.isFollowing ? 'following' : ''}`;
            followBtn.textContent = user.isFollowing ? 'Following' : 'Follow';
            followBtn.setAttribute('data-userid', user._id);
            followBtn.onclick = toggleFollow;

            btns.innerHTML = '';
            btns.appendChild(followBtn);
            const msgBtn = document.createElement('button');
            msgBtn.className = 'messagebtn';
            msgBtn.textContent = 'Message';
            msgBtn.onclick = () => messageUser(user._id, user.name, user.username, avatarUrl(user));
            btns.appendChild(msgBtn);
        }

        // Load user posts grid
        await loadUserPostsGrid(username);

    } catch (e) {
        document.getElementById('profilecard-name').textContent = 'User not found';
    }
}

async function loadUserPostsGrid(username) {
    const grid = document.getElementById('profilecard-posts-grid');
    try {
        const res = await API.Users.getUserPosts(username);
        const posts = res.data?.posts || [];
        if (!posts.length) {
            grid.innerHTML = '<div class="no-posts">No posts yet.</div>';
            return;
        }
        grid.innerHTML = posts.slice(0, 9).map(post => {
            const thumb = post.media?.[0]?.url || '';
            if (thumb) {
                return `<img src="${thumb}" alt="post" onclick="viewPost('${post._id}')">`;
            }
            return `<div style="background:#e0e0e0; aspect-ratio:1; border-radius:4px; display:flex;
                align-items:center; justify-content:center; cursor:pointer; font-size:0.75rem; color:#888; padding:4px; overflow:hidden;"
                onclick="viewPost('${post._id}')">
                <p style="text-align:center; margin:0;">${esc((post.content || '').substring(0, 40))}</p>
            </div>`;
        }).join('');
    } catch (_) {
        grid.innerHTML = '<div class="no-posts">Could not load posts.</div>';
    }
}

async function viewPost(postId) {
    try {
        const post = await API.Posts.getPost(postId);
        // Show post in feed view
        showPanel('main-content');
        document.getElementById('explore-tabs').style.display = 'none';
        document.getElementById('feed-container').innerHTML = buildPostCard(post);
        document.getElementById('load-more-wrap').style.display = 'none';
    } catch (_) {}
}

async function toggleFollow() {
    const btn    = document.getElementById('follow-btn');
    const userId = btn?.dataset.userid;
    if (!userId) return;
    try {
        const res = await API.Follows.toggle(userId);
        btn.textContent  = res.following ? 'Following' : res.pending ? 'Requested' : 'Follow';
        btn.className    = `followbtn ${res.following ? 'following' : res.pending ? 'pending' : ''}`;

        // Update follower count
        const countEl = document.getElementById('profilecard-followers');
        const current = parseInt(countEl.textContent) || 0;
        countEl.textContent = res.following ? current + 1 : Math.max(0, current - 1);

        toast(res.following ? 'Following!' : res.pending ? 'Request sent.' : 'Unfollowed.');
    } catch (e) { toast(e.message, 'error'); }
}

async function messageUser(userId, name, username, avatar) {
    // If called from profile card
    if (!userId) {
        const btn = document.getElementById('follow-btn');
        userId = btn?.dataset.userid;
    }
    if (!userId) return;
    try {
        const conv = await API.Messages.getOrCreate(userId);
        showPanel('messages');
        const profile = await API.Users.getProfile(username || '');
        setTimeout(() => openConversation(
            conv._id, userId,
            name || profile.name,
            avatar || avatarUrl(profile),
            username || profile.username
        ), 200);
    } catch (e) { toast('Could not open chat.', 'error'); }
}

async function showFollowers() {
    if (!profileTarget) return;
    try {
        const res = await API.Follows.getFollowers(profileTarget);
        showUserListModal('Followers', res.data?.users || []);
    } catch (_) {}
}

async function showFollowing() {
    if (!profileTarget) return;
    try {
        const res = await API.Follows.getFollowing(profileTarget);
        showUserListModal('Following', res.data?.users || []);
    } catch (_) {}
}

function showUserListModal(title, users) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:1000; padding:1rem;';
    overlay.innerHTML = `
        <div style="background:white; border-radius:16px; padding:1.5rem; min-width:280px; max-height:70vh; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <strong>${title} (${users.length})</strong>
                <button onclick="this.closest('div').parentElement.remove()" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">&times;</button>
            </div>
            ${users.length === 0 ? '<p style="color:#aaa; text-align:center; padding:1rem;">None yet.</p>' :
                users.map(u => `
                <div style="display:flex; align-items:center; gap:10px; padding:8px; border-radius:8px; cursor:pointer;"
                    onclick="this.closest('div').parentElement.parentElement.remove(); openUserProfile('${u.username}')">
                    <img src="${avatarUrl(u)}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                    <div>
                        <strong style="font-size:0.9rem; display:block;">${esc(u.name)}</strong>
                        <span style="font-size:0.8rem; color:#888;">@${esc(u.username)}</span>
                    </div>
                </div>`).join('')}
        </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════════════════════════
async function liveSearch(q) {
    const results = document.getElementById('search-results');
    results.classList.add('show');
    results.innerHTML = '<div style="padding:10px; color:#aaa; font-size:0.85rem;">Searching...</div>';

    try {
        const data = await API.Search.search(q, 'users');
        const users = data.users || [];

        if (!users.length) {
            results.innerHTML = '<div class="search-no-results">No users found for "' + esc(q) + '"</div>';
            return;
        }

        results.innerHTML = users.slice(0, 6).map(u => `
            <div class="search-result-item" onclick="closeSearch(); openUserProfile('${u.username}')">
                <img src="${avatarUrl(u)}" alt="${esc(u.name)}">
                <div class="search-result-info">
                    <strong>${esc(u.name)}</strong>
                    <span>@${esc(u.username)}</span>
                </div>
            </div>`).join('');
    } catch (_) {
        results.innerHTML = '<div class="search-no-results">Search unavailable.</div>';
    }
}

async function doSearch() {
    const q = document.getElementById('search-bar').value.trim();
    if (!q) return;
    closeSearch();
    showPanel('main-content');
    document.getElementById('explore-tabs').style.display = 'none';

    const container = document.getElementById('feed-container');
    container.innerHTML = '<div class="spinner"><i class="fa-solid fa-spinner"></i> Searching...</div>';

    try {
        const data = await API.Search.search(q);

        let html = '';
        if (data.users?.length) {
            html += `<p style="font-size:0.85rem; font-weight:600; color:#555; margin-bottom:8px;">People</p>`;
            html += data.users.map(u => `
                <div style="display:flex; align-items:center; gap:12px; padding:10px; background:#f0f0f0; border-radius:10px; margin-bottom:8px; cursor:pointer;"
                    onclick="openUserProfile('${u.username}')">
                    <img src="${avatarUrl(u)}" style="width:44px; height:44px; border-radius:50%; object-fit:cover;">
                    <div style="flex:1;">
                        <strong>${esc(u.name)}</strong>
                        <p style="font-size:0.8rem; color:#888; margin:0;">@${esc(u.username)}</p>
                    </div>
                    <button class="followbtn" style="padding:6px 14px; border-radius:20px;" onclick="event.stopPropagation(); quickFollow('${u._id}', this)">Follow</button>
                </div>`).join('');
        }
        if (data.posts?.length) {
            html += `<p style="font-size:0.85rem; font-weight:600; color:#555; margin: 12px 0 8px;">Posts</p>`;
            html += data.posts.map(p => buildPostCard(p)).join('');
        }
        if (!html) html = `<div class="empty-state"><i class="fa-solid fa-search"></i><p>No results for "${esc(q)}"</p></div>`;
        container.innerHTML = html;
    } catch (_) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-search"></i><p>Search failed.</p></div>`;
    }
}

async function searchHashtag(tag) {
    showPanel('main-content');
    document.getElementById('explore-tabs').style.display = 'none';
    const container = document.getElementById('feed-container');
    container.innerHTML = `<div class="spinner"><i class="fa-solid fa-spinner"></i> Loading #${tag}...</div>`;
    try {
        const data = await API.Search.byHashtag(tag);
        const posts = data.posts || [];
        if (!posts.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-hashtag"></i><p>No posts for #${esc(tag)}</p></div>`;
            return;
        }
        container.innerHTML = `<p style="font-size:0.9rem; font-weight:600; color:blue; margin-bottom:8px;">#${esc(tag)}</p>` +
            posts.map(p => buildPostCard(p)).join('');
    } catch (_) {}
}

function closeSearch() {
    document.getElementById('search-results').classList.remove('show');
}

// ── OLD script.js functions kept for compatibility ────────────────────────────
function liketoggle() {
    const like = document.getElementById('like');
    if (!like) return;
    like.classList.toggle('fa-regular');
    like.classList.toggle('fa-solid');
    like.classList.toggle('active');
}
function chatbox() {
    // Legacy - just open messages
    showMessages();
}