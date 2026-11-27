"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, Check, Clock, Crown, FileText, Hash, ImageIcon, Info, Lock, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Send, Shield, Trash2, UserCheck, UserX, Users, X } from "lucide-react";
import ImageCropper from "./ImageCropper";
import { FeedPost, UniversityGroup } from "../../data/mock";
import { createClient } from "../../lib/supabase/client";
import {
  JoinRequest, ServerMember, ServerMessage, cancelJoinRequest, createServer, decideJoinRequest, deleteGroupMessage, deleteServer,
  fetchGroupMembers, fetchGroupMessages, fetchJoinRequests, fetchMyGroupIds, fetchMyPendingRequestIds, removeServerMember,
  requestJoinServer, sendGroupMessage, setGroupMembership, setServerMemberRole, transferServerOwnership, updateServer, uploadServerImage,
} from "../../lib/supabase/data";

const STANDARD_CATEGORIES = ["Club", "Department", "Batch", "Technology", "Design", "Sports", "Arts & Culture", "Careers", "Study", "Community"];

type Props = {
  view: "list" | "detail";
  groups: UniversityGroup[] | null;
  selected: UniversityGroup | null;
  posts: FeedPost[] | null;
  renderPost: (post: FeedPost) => ReactNode;
  authenticated: boolean;
  profileId: string | null;
  universityId: string;
  universityName: string;
  notify: (message: string) => void;
  onOpen: (group: UniversityGroup) => void;
  onBack: () => void;
  onOpenMember: (profileId: string) => void;
  onRefresh: () => Promise<void> | void;
  onMembership: (name: string, joined: boolean) => void;
  onPost: (body: string, image: File | null) => Promise<void>;
};

function ServerIcon({ group, size = 48 }: { group: UniversityGroup; size?: number }) {
  return (
    <span className="cs-icon" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {group.iconUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={group.iconUrl} alt="" loading="lazy" decoding="async"/>
        : group.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ---------------- create / edit ---------------- */
function ServerFormModal({ mode, group, profileId, universityId, onClose, onSaved, onDeleted, notify }: {
  mode: "create" | "edit"; group?: UniversityGroup; profileId: string; universityId: string;
  onClose: () => void; onSaved: (id?: string) => void; onDeleted: () => void; notify: (message: string) => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [category, setCategory] = useState(group?.category ?? "Club");
  const [rules, setRules] = useState(group?.rules ?? "");
  const [joinMode, setJoinMode] = useState<"open" | "approval">(group?.joinMode ?? "open");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<{ kind: "icon" | "banner"; file: File } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const iconPreview = useMemo(() => (iconFile ? URL.createObjectURL(iconFile) : group?.iconUrl ?? ""), [iconFile, group?.iconUrl]);
  const bannerPreview = useMemo(() => (bannerFile ? URL.createObjectURL(bannerFile) : group?.image ?? ""), [bannerFile, group?.image]);
  const categories = STANDARD_CATEGORIES.includes(category) ? STANDARD_CATEGORIES : [category, ...STANDARD_CATEGORIES];
  const dark = typeof document !== "undefined" && !!document.querySelector(".app-shell.dark");

  function pick(kind: "icon" | "banner", event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file."); return; }
    setError("");
    setCrop({ kind, file });
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const iconUrl = iconFile ? await uploadServerImage(iconFile, "icon") : undefined;
      const imageUrl = bannerFile ? await uploadServerImage(bannerFile, "banner") : undefined;
      if (mode === "create") {
        const id = await createServer(profileId, universityId, { name: name.trim(), description: description.trim(), category, rules: rules.trim(), iconUrl, imageUrl, joinMode });
        notify("Your server is live");
        onSaved(id);
      } else if (group?.id) {
        await updateServer(group.id, { name: name.trim(), description: description.trim(), category, rules: rules.trim(), iconUrl, imageUrl, joinMode });
        notify("Server updated");
        onSaved(group.id);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/rules|icon_url|join_mode|column/i.test(message) ? "Run the Campus Servers SQL update first, then try again." : message || "Could not save the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeServer() {
    if (!group?.id) return;
    setSaving(true);
    setError("");
    try {
      await deleteServer(group.id);
      notify("Server deleted");
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the server.");
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="cs-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !crop) onClose(); }}>
      <div className={`cs-modal ${dark ? "is-dark" : ""}`} role="dialog" aria-modal="true" aria-label={mode === "create" ? "Create a server" : "Edit server"}>
        <div className="cs-modal-head">
          <b>{mode === "create" ? "Create a server" : "Edit server"}</b>
          <button className="cs-x" aria-label="Close" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="cs-modal-body">
          <div className="cs-pickers">
            <label className="cs-picker cs-picker-icon">
              <span className="cs-icon" style={{ width: 72, height: 72, fontSize: 28 }}>
                {iconPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={iconPreview} alt=""/>
                  : <Camera size={22}/>}
              </span>
              <small>Server icon</small>
              <input type="file" accept="image/*" onChange={event => pick("icon", event)}/>
            </label>
            <label className="cs-picker cs-picker-banner">
              {bannerPreview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={bannerPreview} alt=""/>
                : <span><ImageIcon size={22}/></span>}
              <small>Banner</small>
              <input type="file" accept="image/*" onChange={event => pick("banner", event)}/>
            </label>
          </div>
          <label className="cs-field">Server name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="e.g. Robotics Club"/></label>
          <label className="cs-field">Category
            <select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
          </label>
          <label className="cs-field">About<textarea rows={3} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} placeholder="What is this server about?"/></label>
          <label className="cs-field">Rules (optional)<textarea rows={3} maxLength={1000} value={rules} onChange={event => setRules(event.target.value)} placeholder="Be kind. Stay on topic."/></label>
          <div className="cs-field">Who can join
            <div className="cs-mode">
              <button type="button" className={joinMode === "open" ? "active" : ""} onClick={() => setJoinMode("open")}><b>Open</b><small>Anyone at your university joins instantly</small></button>
              <button type="button" className={joinMode === "approval" ? "active" : ""} onClick={() => setJoinMode("approval")}><b><Lock size={13}/> Approval required</b><small>Admins review every request</small></button>
            </div>
          </div>
          {mode === "edit" && (
            <div className="cs-danger">
              <b>Danger zone</b>
              {!deleteOpen
                ? <button type="button" className="cs-btn cs-btn-danger" onClick={() => setDeleteOpen(true)}><Trash2 size={15}/> Delete this server</button>
                : (
                  <>
                    <p>This permanently deletes the server, its posts, chat and members. Type <b>{group?.name}</b> to confirm.</p>
                    <input value={confirmName} onChange={event => setConfirmName(event.target.value)} placeholder={group?.name}/>
                    <button type="button" className="cs-btn cs-btn-danger" disabled={confirmName.trim() !== group?.name || saving} onClick={() => void removeServer()}>Delete forever</button>
                  </>
                )}
            </div>
          )}
          {error && <p className="cs-error">{error}</p>}
        </div>
        <div className="cs-modal-foot">
          <button className="cs-btn" onClick={onClose}>Cancel</button>
          <button className="cs-btn cs-btn-solid" disabled={!name.trim() || saving} onClick={() => void save()}>{saving ? "Saving..." : mode === "create" ? "Create server" : "Save changes"}</button>
        </div>
      </div>
      {crop && (
        <ImageCropper
          file={crop.file}
          aspect={crop.kind === "icon" ? 1 : 3}
          round={crop.kind === "icon"}
          outWidth={crop.kind === "icon" ? 512 : 1500}
          title={crop.kind === "icon" ? "Crop server icon" : "Crop banner"}
          onCancel={() => setCrop(null)}
          onDone={file => { if (crop.kind === "icon") setIconFile(file); else setBannerFile(file); setCrop(null); }}
        />
      )}
    </div>,
    document.body
  );
}

/* ---------------- chat ---------------- */
function ServerChat({ groupId, profileId, isMember, canModerate, notify }: { groupId: string; profileId: string | null; isMember: boolean; canModerate: boolean; notify: (message: string) => void }) {
  const [messages, setMessages] = useState<ServerMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMember) return;
    let active = true;
    const load = () => fetchGroupMessages(groupId).then(rows => { if (active) { setMessages(rows); setFailed(false); } }).catch(() => { if (active) setFailed(true); });
    void load();
    const supabase = createClient();
    const channel = supabase.channel(`server-chat:${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, () => { void load(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [groupId, isMember]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = listRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || !profileId || sending) return;
    setSending(true);
    try {
      await sendGroupMessage(groupId, profileId, body);
      setText("");
      setMessages(await fetchGroupMessages(groupId));
    } catch {
      notify("Message could not be sent");
    } finally {
      setSending(false);
    }
  }

  if (!isMember) return <div className="cs-empty"><MessageSquare size={26}/><b>Members-only chat</b><p>Join this server to read and send messages.</p></div>;
  if (failed && !messages) return <div className="cs-empty"><b>Chat is not ready yet</b><p>Run the Campus Servers SQL update in Supabase to turn on chat.</p></div>;

  return (
    <div className="cs-chat">
      <div className="cs-chat-head"><Hash size={16}/> general</div>
      <div className="cs-chat-list" ref={listRef}>
        {messages === null && <p className="cs-muted">Loading messages...</p>}
        {messages?.length === 0 && <p className="cs-muted">No messages yet. Say hello!</p>}
        {messages?.map(message => {
          const mine = message.senderId === profileId;
          return (
            <div key={message.id} className={`cs-msg ${mine ? "is-mine" : ""}`}>
              {!mine && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cs-msg-avatar" src={message.senderAvatar} alt="" loading="lazy"/>
              )}
              <div className="cs-bubble">
                {!mine && <b>{message.senderName}</b>}
                <p>{message.body}</p>
                <small>{timeLabel(message.createdAt)}</small>
              </div>
              {(mine || canModerate) && (
                <button className="cs-msg-del" aria-label="Delete message" onClick={() => void deleteGroupMessage(message.id).then(() => fetchGroupMessages(groupId)).then(setMessages).catch(() => notify("Could not delete the message"))}><Trash2 size={14}/></button>
              )}
            </div>
          );
        })}
      </div>
      <div className="cs-chat-input">
        <input value={text} maxLength={2000} placeholder="Message #general" onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/>
        <button className="cs-send" aria-label="Send message" disabled={!text.trim() || sending} onClick={() => void send()}><Send size={18}/></button>
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */
export default function CampusServers(props: Props) {
  const { view, groups, posts, renderPost, authenticated, profileId, universityId, universityName, notify, onOpen, onBack, onOpenMember, onRefresh, onMembership, onPost } = props;
  const selected = useMemo(() => groups?.find(group => group.id === props.selected?.id) ?? props.selected, [groups, props.selected]);
  const [myIds, setMyIds] = useState<string[]>([]);
  const [listTab, setListTab] = useState<"discover" | "mine">("discover");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tab, setTab] = useState<"posts" | "chat" | "members" | "requests" | "about">("posts");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [members, setMembers] = useState<ServerMember[] | null>(null);
  const [form, setForm] = useState<null | "create" | "edit">(null);
  const [postBody, setPostBody] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) { setMyIds([]); setPendingIds([]); return; }
    let active = true;
    fetchMyGroupIds(profileId).then(ids => { if (active) setMyIds(ids); }).catch(() => undefined);
    fetchMyPendingRequestIds(profileId).then(ids => { if (active) setPendingIds(ids); }).catch(() => undefined);
    return () => { active = false; };
  }, [profileId]);

  useEffect(() => { setTab("posts"); setMembers(null); setRequests(null); setManageId(null); setConfirmKey(null); setPostBody(""); setPostImage(null); }, [selected?.id]);
  useEffect(() => { setConfirmKey(null); }, [manageId]);

  useEffect(() => {
    if (view !== "detail" || !selected?.id) return;
    let active = true;
    fetchGroupMembers(selected.id).then(rows => { if (active) setMembers(rows); }).catch(() => { if (active) setMembers([]); });
    return () => { active = false; };
  }, [view, selected?.id, selected?.memberCount]);

  const myRole = !profileId || !selected ? "" : selected.ownerId === profileId ? "owner" : members?.find(member => member.profileId === profileId)?.role ?? "";
  const isManager = myRole === "owner" || myRole === "admin" || myRole === "moderator";

  useEffect(() => {
    if (view !== "detail" || !selected?.id || !isManager) { setRequests(null); return; }
    let active = true;
    fetchJoinRequests(selected.id).then(rows => { if (active) setRequests(rows); }).catch(() => { if (active) setRequests([]); });
    return () => { active = false; };
  }, [view, selected?.id, isManager, tab]);

  async function toggleJoin(group: UniversityGroup) {
    if (!authenticated || !profileId) { notify("Sign in to join servers"); return; }
    const id = group.id;
    if (!id) { notify("This server is not available"); return; }
    const isJoined = myIds.includes(id);
    const isPending = pendingIds.includes(id);
    setBusyId(id);
    try {
      if (isJoined) {
        await setGroupMembership(id, profileId, false);
        setMyIds(ids => ids.filter(item => item !== id));
        onMembership(group.name, false);
        notify(`You left ${group.name}`);
      } else if (isPending) {
        await cancelJoinRequest(id);
        setPendingIds(ids => ids.filter(item => item !== id));
        notify("Request cancelled");
      } else if (group.joinMode === "approval") {
        const result = await requestJoinServer(id);
        if (result === "pending") { setPendingIds(ids => [...ids, id]); notify("Request sent. An admin will review it."); }
        else { setMyIds(ids => [...ids, id]); onMembership(group.name, true); notify(`You joined ${group.name}`); }
      } else {
        await setGroupMembership(id, profileId, true);
        setMyIds(ids => [...ids, id]);
        onMembership(group.name, true);
        notify(`You joined ${group.name}`);
      }
      await onRefresh();
    } catch (cause) {
      notify(cause instanceof Error && cause.message ? cause.message : "Could not update membership");
    } finally {
      setBusyId(null);
    }
  }

  function joinLabel(group: UniversityGroup): ReactNode {
    if (group.ownerId === profileId) return <><Crown size={15}/> You own this</>;
    if (myIds.includes(group.id ?? "")) return <><Check size={15}/> Joined</>;
    if (pendingIds.includes(group.id ?? "")) return <><Clock size={15}/> Requested</>;
    if (group.joinMode === "approval") return <><Lock size={15}/> Request to join</>;
    return <><Plus size={15}/> Join server</>;
  }

  async function runAction(work: () => Promise<void>, success: string) {
    setActionBusy(true);
    try {
      await work();
      notify(success);
      if (selected?.id) setMembers(await fetchGroupMembers(selected.id));
      await onRefresh();
    } catch (cause) {
      notify(cause instanceof Error && cause.message ? cause.message : "That did not work. Try again.");
    } finally {
      setActionBusy(false);
      setManageId(null);
    }
  }

  async function decide(request: JoinRequest, approve: boolean) {
    setActionBusy(true);
    try {
      await decideJoinRequest(request.id, approve);
      setRequests(rows => (rows ?? []).filter(item => item.id !== request.id));
      notify(approve ? `${request.name} joined the server` : "Request declined");
      if (approve) { if (selected?.id) setMembers(await fetchGroupMembers(selected.id)); await onRefresh(); }
    } catch (cause) {
      notify(cause instanceof Error && cause.message ? cause.message : "Could not update the request");
    } finally {
      setActionBusy(false);
    }
  }

  const categories = useMemo(() => {
    const extra = (groups ?? []).map(group => group.category).filter(item => item && !STANDARD_CATEGORIES.includes(item));
    return ["All", ...STANDARD_CATEGORIES, ...Array.from(new Set(extra))];
  }, [groups]);

  const filtered = useMemo(() => (groups ?? []).filter(group => {
    if (listTab === "mine" && !myIds.includes(group.id ?? "")) return false;
    if (category !== "All" && group.category !== category) return false;
    return `${group.name} ${group.description ?? ""} ${group.category}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [groups, listTab, myIds, category, query]);

  const form_ = form && profileId ? (
    <ServerFormModal
      mode={form}
      group={form === "edit" ? selected ?? undefined : undefined}
      profileId={profileId}
      universityId={universityId}
      notify={notify}
      onClose={() => setForm(null)}
      onDeleted={async () => {
        const name = selected?.name;
        setForm(null);
        if (name) onMembership(name, false);
        await onRefresh();
        onBack();
      }}
      onSaved={async id => {
        setForm(null);
        await onRefresh();
        if (form === "create" && id) {
          setMyIds(ids => (ids.includes(id) ? ids : [...ids, id]));
          setListTab("mine");
        }
      }}
    />
  ) : null;

  /* ----- list view ----- */
  if (view === "list") {
    return (
      <div className="cs">
        <div className="cs-banner">
          <span className="cs-eyebrow">{universityName.toUpperCase()}</span>
          <h2>Campus Servers</h2>
          <p>Join your university&apos;s clubs, departments and communities. Chat, post and meet people who share your interests.</p>
          <button className="cs-btn cs-btn-solid" onClick={() => (authenticated ? setForm("create") : notify("Sign in to create a server"))}><Plus size={16}/> Create a server</button>
        </div>

        <div className="cs-seg" role="tablist">
          <button className={listTab === "discover" ? "active" : ""} onClick={() => setListTab("discover")}>Discover</button>
          <button className={listTab === "mine" ? "active" : ""} onClick={() => setListTab("mine")}>My servers{myIds.length ? ` (${myIds.length})` : ""}</button>
        </div>

        <label className="cs-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search servers..."/></label>
        <div className="cs-chips">{categories.map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>

        {groups === null && <div className="cs-empty"><p>Loading servers...</p></div>}
        {groups !== null && filtered.length === 0 && (
          <div className="cs-empty">
            <Users size={26}/>
            <b>{listTab === "mine" ? "You have not joined any server yet" : "No servers found"}</b>
            <p>{listTab === "mine" ? "Browse Discover and join one, or start your own." : "Try another search or create the first one."}</p>
          </div>
        )}
        <div className="cs-grid">
          {filtered.map(group => {
            const joinedHere = myIds.includes(group.id ?? "");
            return (
              <article className="cs-card" key={group.id ?? group.name}>
                <button className="cs-card-open" onClick={() => onOpen(group)} aria-label={`Open ${group.name}`}>
                  <span className="cs-cover">{group.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={group.image} alt="" loading="lazy" decoding="async"/>
                    : <span className="cs-cover-fallback"/>}</span>
                  <span className="cs-card-main">
                    <ServerIcon group={group} size={52}/>
                    <span className="cs-card-text">
                      <b>{group.name}</b>
                      <small>{group.category} · {group.members}</small>
                    </span>
                  </span>
                  {group.description && <span className="cs-desc">{group.description}</span>}
                </button>
                <button className={`cs-btn cs-join ${joinedHere || pendingIds.includes(group.id ?? "") ? "" : "cs-btn-solid"}`} disabled={busyId === group.id || group.ownerId === profileId} onClick={() => void toggleJoin(group)}>
                  {joinLabel(group)}
                </button>
              </article>
            );
          })}
        </div>
        {form_}
      </div>
    );
  }

  /* ----- detail view ----- */
  if (!selected) {
    return <div className="cs"><div className="cs-empty"><b>Choose a server</b><p>Open a server from Campus Servers to see it here.</p><button className="cs-btn" onClick={onBack}>Back to servers</button></div></div>;
  }
  const isOwner = !!profileId && selected.ownerId === profileId;
  const isAdminRole = isOwner || myRole === "admin";
  const isMember = !!selected.id && myIds.includes(selected.id);
  const ownerMember = members?.find(member => member.profileId === selected.ownerId);

  return (
    <div className="cs">
      <div className="cs-hero">
        {selected.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={selected.image} alt=""/>
          : <span className="cs-cover-fallback"/>}
        <button className="cs-back" onClick={onBack} aria-label="Back to servers"><ArrowLeft size={20}/></button>
      </div>
      <div className="cs-head">
        <ServerIcon group={selected} size={76}/>
        <div className="cs-head-text">
          <h2>{selected.name}</h2>
          <p>{selected.category} · {selected.members}{selected.joinMode === "approval" ? " · Approval required" : ""}</p>
        </div>
        <div className="cs-head-actions">
          {isOwner
            ? <button className="cs-btn" onClick={() => setForm("edit")}><Pencil size={15}/> Edit</button>
            : <button className={`cs-btn ${isMember || pendingIds.includes(selected.id ?? "") ? "" : "cs-btn-solid"}`} disabled={busyId === selected.id} onClick={() => void toggleJoin(selected)}>{joinLabel(selected)}</button>}
        </div>
      </div>
      {selected.description && <p className="cs-about-line">{selected.description}</p>}

      <div className="cs-tabs" role="tablist">
        <button className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}><FileText size={16}/> Posts</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><MessageSquare size={16}/> Chat</button>
        <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}><Users size={16}/> Members</button>
        {isManager && <button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><UserCheck size={16}/> Requests{requests && requests.length > 0 ? <em className="cs-count">{requests.length}</em> : null}</button>}
        <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}><Info size={16}/> About</button>
      </div>

      {tab === "posts" && (
        <div className="cs-panel">
          {isMember ? (
            <div className="cs-composer">
              <textarea rows={2} maxLength={2000} value={postBody} onChange={event => setPostBody(event.target.value)} placeholder={`Share something with ${selected.name}...`}/>
              {postImage && <span className="cs-file">{postImage.name} <button aria-label="Remove image" onClick={() => setPostImage(null)}><X size={14}/></button></span>}
              <div className="cs-composer-row">
                <label className="cs-icon-btn" aria-label="Add image"><ImageIcon size={18}/><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event => { setPostImage(event.target.files?.[0] ?? null); event.target.value = ""; }}/></label>
                <button className="cs-btn cs-btn-solid" disabled={!postBody.trim() || posting} onClick={async () => {
                  setPosting(true);
                  try { await onPost(postBody.trim(), postImage); setPostBody(""); setPostImage(null); notify("Posted to the server"); }
                  catch (cause) { notify(cause instanceof Error ? cause.message : "Post could not be saved"); }
                  finally { setPosting(false); }
                }}>{posting ? "Posting..." : "Post"}</button>
              </div>
            </div>
          ) : <div className="cs-note">Join this server to post. Anyone at your university can read its posts.</div>}
          {posts === null && <div className="cs-empty"><p>Loading posts...</p></div>}
          {posts !== null && posts.length === 0 && <div className="cs-empty"><FileText size={26}/><b>No posts yet</b><p>{isMember ? "Be the first to post in this server." : "Join to start the conversation."}</p></div>}
          {posts?.map(post => renderPost(post))}
        </div>
      )}

      {tab === "chat" && selected.id && (
        <div className="cs-panel"><ServerChat groupId={selected.id} profileId={profileId} isMember={isMember} canModerate={isManager} notify={notify}/></div>
      )}

      {tab === "members" && (
        <div className="cs-panel">
          {members === null && <div className="cs-empty"><p>Loading members...</p></div>}
          {members?.length === 0 && <div className="cs-empty"><p>No members yet.</p></div>}
          <div className="cs-members">
            {[...(members ?? [])].sort((a, b) => Number(b.profileId === selected.ownerId) - Number(a.profileId === selected.ownerId)).map(member => {
              const isTarget = member.profileId === selected.ownerId;
              const canManage = !isTarget && member.profileId !== profileId && (isOwner || (myRole === "admin" && (member.role === "member" || member.role === "moderator")));
              const open = manageId === member.profileId;
              return (
                <div className="cs-member-wrap" key={member.profileId}>
                  <div className="cs-member">
                    <button className="cs-member-main" onClick={() => onOpenMember(member.profileId)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={member.avatar} alt="" loading="lazy" decoding="async"/>
                      <span className="cs-member-text"><b>{member.name}</b><small>{member.department || member.headline || "Member"}</small></span>
                    </button>
                    {isTarget ? <span className="cs-role"><Crown size={13}/> Owner</span> : member.role !== "member" ? <span className="cs-role"><Shield size={13}/> {member.role === "admin" ? "Admin" : "Moderator"}</span> : null}
                    {canManage && <button className="cs-kebab" aria-label="Manage member" onClick={() => setManageId(open ? null : member.profileId)}><MoreHorizontal size={18}/></button>}
                  </div>
                  {open && selected.id && (
                    <div className="cs-manage">
                      {isOwner && (["admin", "moderator", "member"] as const).filter(role => role !== member.role).map(role => (
                        <button key={role} className="cs-chip-btn" disabled={actionBusy} onClick={() => void runAction(() => setServerMemberRole(selected.id!, member.profileId, role), `${member.name} is now ${role === "member" ? "a member" : `an ${role === "admin" ? "admin" : "moderator"}`}`.replace("an moderator", "a moderator"))}>Make {role}</button>
                      ))}
                      {isOwner && (
                        <button className="cs-chip-btn" disabled={actionBusy} onClick={() => { if (confirmKey !== `own:${member.profileId}`) { setConfirmKey(`own:${member.profileId}`); return; } void runAction(() => transferServerOwnership(selected.id!, member.profileId), `${member.name} is the new owner`); }}>{confirmKey === `own:${member.profileId}` ? "Tap again to confirm" : "Make owner"}</button>
                      )}
                      {isAdminRole && (
                        <button className="cs-chip-btn cs-chip-danger" disabled={actionBusy} onClick={() => { if (confirmKey !== `rm:${member.profileId}`) { setConfirmKey(`rm:${member.profileId}`); return; } void runAction(() => removeServerMember(selected.id!, member.profileId), `${member.name} was removed`); }}><UserX size={14}/> {confirmKey === `rm:${member.profileId}` ? "Tap again to remove" : "Remove"}</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "requests" && isManager && (
        <div className="cs-panel">
          {requests === null && <div className="cs-empty"><p>Loading requests...</p></div>}
          {requests?.length === 0 && <div className="cs-empty"><UserCheck size={26}/><b>No pending requests</b><p>{selected.joinMode === "approval" ? "New join requests will show up here." : "This server is open. Turn on approval in Edit to review requests."}</p></div>}
          {requests?.map(request => (
            <div className="cs-request" key={request.id}>
              <button className="cs-member-main" onClick={() => onOpenMember(request.profileId)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={request.avatar} alt="" loading="lazy" decoding="async"/>
                <span className="cs-member-text"><b>{request.name}</b><small>{request.department || request.headline || "Member"}</small></span>
              </button>
              {request.message && <p className="cs-request-note">{request.message}</p>}
              <div className="cs-request-actions">
                <button className="cs-btn" disabled={actionBusy} onClick={() => void decide(request, false)}><X size={15}/> Decline</button>
                <button className="cs-btn cs-btn-solid" disabled={actionBusy} onClick={() => void decide(request, true)}><Check size={15}/> Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "about" && (
        <div className="cs-panel">
          <div className="cs-card-plain">
            <h3>About</h3>
            <p>{selected.description || "No description yet."}</p>
            <h3>Rules</h3>
            <p className="cs-pre">{selected.rules?.trim() || "No rules have been set."}</p>
            <h3>Details</h3>
            <ul className="cs-facts">
              <li><span>Category</span><b>{selected.category}</b></li>
              <li><span>Members</span><b>{selected.memberCount ?? 0}</b></li>
              <li><span>Joining</span><b>{selected.joinMode === "approval" ? "Approval required" : "Open to everyone"}</b></li>
              <li><span>University</span><b>{universityName}</b></li>
              {selected.createdAt && <li><span>Created</span><b>{new Date(selected.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</b></li>}
              {ownerMember && <li><span>Owner</span><b>{ownerMember.name}</b></li>}
            </ul>
          </div>
        </div>
      )}
      {form_}
    </div>
  );
}
