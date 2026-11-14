"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { Person } from "../../data/mock";
import { CampusStory, deleteCampusStory, fetchCampusStories, insertCampusStory } from "../../lib/supabase/data";
import { createClient } from "../../lib/supabase/client";

function initialsAvatar(person: Person) {
  return person.avatar || "/connect-mark.svg";
}

export default function StoryRail({ profileId, account, authenticated, onNotice }: {
  profileId: string | null;
  account: Person;
  authenticated: boolean;
  onNotice: (message: string) => void;
}) {
  const [stories, setStories] = useState<CampusStory[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!authenticated) { setStories([]); setLoading(false); return; }
    try { setStories(await fetchCampusStories()); }
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
        <button className="story story-add" onClick={() => authenticated ? inputRef.current?.click() : onNotice("Sign in to share a story.")} disabled={uploading}>
          <span className={`story-ring ${ownStories.length ? "has-story" : ""}`}>
            <img className="avatar" src={initialsAvatar(account)} alt=""/>
            <i>{uploading ? <LoaderCircle size={13}/> : <Plus size={13}/>}</i>
          </span><span>{ownStories.length ? "Your story" : "Add story"}</span>
        </button>
        {otherAuthors.map(([authorId, rows]) => <button className="story" key={authorId} onClick={() => { setSelectedAuthor(authorId); setSelectedIndex(0); }}>
          <span className="story-ring has-story"><img className="avatar" src={rows[0].author.avatar} alt=""/></span>
          <span>{rows[0].author.name.split(" ")[0]}</span>
        </button>)}
        {!loading && !otherAuthors.length && <span className="muted tiny story-empty">No campus stories yet. Share the first one.</span>}
      </div>
      <input ref={inputRef} className="story-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadStory}/>
      {ownStories.length > 0 && <button className="story-own-open" onClick={() => { setSelectedAuthor(profileId); setSelectedIndex(0); }}>View your {ownStories.length} {ownStories.length === 1 ? "story" : "stories"}</button>}
    </section>
    {activeStory && <div className="story-viewer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedAuthor(null); }}>
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
    </div>}
  </>;
}
