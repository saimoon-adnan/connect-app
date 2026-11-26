"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Person } from "../../data/mock";
import { CampusStory, deleteCampusStory, fetchCampusStories, insertCampusStory } from "../../lib/supabase/data";
import { createClient } from "../../lib/supabase/client";

function initialsAvatar(person: Person) {
  return person.avatar || "/connect-mark.svg";
}

export default function StoryRail({ profileId, account, authenticated, onNotice, universityId }: {
  profileId: string | null;
  account: Person;
  authenticated: boolean;
  onNotice: (message: string) => void;
  universityId: string | null;
}) {
  const [stories, setStories] = useState<CampusStory[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});
  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem("connect_seen_stories") || "{}")); } catch {} }, []);
  const latestOf = (rows: CampusStory[]) => rows.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a), rows[0]);
  function markSeen(authorId: string, rows: CampusStory[]) {
    const next = { ...seen, [authorId]: latestOf(rows).id };
    setSeen(next);
    try { localStorage.setItem("connect_seen_stories", JSON.stringify(next)); } catch {}
  }

  async function refresh() {
    if (!authenticated) { setStories([]); setLoading(false); return; }
    try { setStories(await fetchCampusStories(universityId || undefined)); }
    catch { onNotice("Could not load campus stories. Run the stories migration first."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [profileId, authenticated]);

  const groupedStories = useMemo(() => {
    const map = new Map<string, CampusStory[]>();
    for (const story of stories) map.set(story.authorId, [...(map.get(story.authorId) ?? []), story]);
    return map;
  }, [stories]);
  const otherAuthors = [...groupedStories.entries()].filter(([authorId]) => authorId !== profileId);
  const ownStories = profileId ? groupedStories.get(profileId) ?? [] : [];
  const activeStories = selectedAuthor ? groupedStories.get(selectedAuthor) ?? [] : [];
  const activeStory = activeStories[selectedIndex];

  async function uploadStory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!authenticated || !profileId) { onNotice("Sign in to share a story."); return; }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { onNotice("Choose a JPG, PNG, WEBP, or GIF image."); return; }
    if (file.size > 5 * 1024 * 1024) { onNotice("Story images must be 5 MB or smaller."); return; }
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Please sign in again.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/stories/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("profile-media").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const url = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      await insertCampusStory(profileId, url);
      await refresh();
      onNotice("Your story is live for 24 hours.");
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : "Could not upload your story.");
    } finally { setUploading(false); }
  }

  async function removeStory() {
    if (!activeStory || activeStory.authorId !== profileId) return;
    try {
      await deleteCampusStory(activeStory.id, activeStory.imageUrl);
      const next = activeStories.filter(story => story.id !== activeStory.id);
      setStories(rows => rows.filter(story => story.id !== activeStory.id));
      if (next.length) setSelectedIndex(Math.min(selectedIndex, next.length - 1));
      else setSelectedAuthor(null);
      onNotice("Story deleted.");
    } catch { onNotice("Could not delete story."); }
  }

  return <>
    <section className="stories">
      <div className="stories-head"><b>University stories</b><span>{loading ? "Loading…" : "24 hours"}</span></div>
      <div className="stories-row">
        <div className="ig-item">
          <div className="ig-wrap">
            <button className={`ig-ring ${ownStories.length ? (profileId && seen[profileId] === latestOf(ownStories).id ? "is-seen" : "") : "ig-none"}`} aria-label={ownStories.length ? "View your story" : "Add story"} onClick={() => { if (ownStories.length && profileId) { markSeen(profileId, ownStories); setSelectedAuthor(profileId); setSelectedIndex(0); } else if (authenticated) inputRef.current?.click(); else onNotice("Sign in to share a story."); }}>
              <img src={initialsAvatar(account)} alt="" loading="lazy"/>
            </button>
            <button className="ig-plus" aria-label="Add story" disabled={uploading} onClick={() => authenticated ? inputRef.current?.click() : onNotice("Sign in to share a story.")}>{uploading ? <LoaderCircle size={13}/> : <Plus size={15}/>}</button>
          </div>
          <span className="ig-name">{ownStories.length ? "Your story" : "You"}</span>
        </div>
        {otherAuthors.map(([authorId, rows]) => { const isSeen = seen[authorId] === latestOf(rows).id; return <div className="ig-item" key={authorId}>
          <div className="ig-wrap"><button className={`ig-ring ${isSeen ? "is-seen" : ""}`} aria-label={`${rows[0].author.name}'s story`} onClick={() => { markSeen(authorId, rows); setSelectedAuthor(authorId); setSelectedIndex(0); }}><img src={rows[0].author.avatar || "/connect-mark.svg"} alt="" loading="lazy"/></button></div>
          <span className="ig-name">{rows[0].author.name.split(" ")[0]}</span>
        </div>; })}
        {!loading && !otherAuthors.length && <span className="muted tiny story-empty">No campus stories yet. Share the first one.</span>}
      </div>
      <input ref={inputRef} className="story-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadStory}/>
    </section>
    {activeStory && typeof document !== "undefined" && createPortal(<div className="story-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedAuthor(null); }}>
      <section className="story-viewer" aria-label={`${activeStory.author.name}'s story`}>
        <div className="story-progress">{activeStories.map((story, index) => <i key={story.id} className={index <= selectedIndex ? "done" : ""}/>)}</div>
        <header><img src={activeStory.author.avatar} alt=""/><b>{activeStory.author.name}</b><small>{new Date(activeStory.createdAt).toLocaleString()}</small>
          {activeStory.authorId === profileId && <button aria-label="Delete story" onClick={removeStory}><Trash2 size={17}/></button>}
          <button aria-label="Close story" onClick={() => setSelectedAuthor(null)}><X size={19}/></button>
        </header>
        <img className="story-viewer-image" src={activeStory.imageUrl} alt={`${activeStory.author.name}'s campus story`}/>
        <button className="story-viewer-prev" aria-label="Previous story" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(index => Math.max(0, index - 1))}><ChevronLeft/></button>
        <button className="story-viewer-next" aria-label="Next story" disabled={selectedIndex >= activeStories.length - 1} onClick={() => setSelectedIndex(index => Math.min(activeStories.length - 1, index + 1))}><ChevronRight/></button>
        <footer>Expires {new Date(activeStory.expiresAt).toLocaleString()}</footer>
      </section>
    </div>, document.body)}
  </>;
}