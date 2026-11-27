import { FeedPost, Opportunity, Person, UniversityGroup } from "../../data/mock";
import { createClient } from "./client";

export const NUB_UNIVERSITY_ID = "00000000-0000-4000-8000-000000000001";

export type University = { id: string; name: string; slug: string; city: string };

export async function fetchUniversities(): Promise<University[]> {
  const { data, error } = await createClient().from("universities").select("id,name,slug,city").order("name");
  if (error) throw error;
  return data ?? [];
}

export type CampusStory = { id: string; authorId: string; imageUrl: string; createdAt: string; expiresAt: string; author: Person };

export async function fetchCampusStories(universityId = NUB_UNIVERSITY_ID): Promise<CampusStory[]> {
  const { data, error } = await createClient().from("stories")
    .select("id,author_id,image_url,created_at,expires_at,author:profiles!stories_author_id_fkey(id,display_name,headline,avatar_url,university:universities!profiles_university_id_fkey(id,name))")
    .eq("profiles.university_id", universityId)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row, index) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    if (!author) return [];
    const university = Array.isArray(author.university) ? author.university[0] : author.university;
    return [{ id: row.id, authorId: row.author_id, imageUrl: row.image_url, createdAt: row.created_at, expiresAt: row.expires_at,
      author: { id: index + 1, profileId: author.id, universityId: university?.id, isRegistered: true, name: author.display_name, role: author.headline ?? "University member",
        school: university?.name ?? "Northern University Bangladesh", avatar: author.avatar_url ?? uniqueAvatarUrl(author.display_name, index) } }];
  });
}

export async function insertCampusStory(authorId: string, imageUrl: string) {
  const { error } = await createClient().from("stories").insert({ author_id: authorId, image_url: imageUrl });
  if (error) throw error;
}

export async function deleteCampusStory(storyId: string, imageUrl: string) {
  const supabase = createClient();
  const { error } = await supabase.from("stories").delete().eq("id", storyId);
  if (error) throw error;
  const marker = "/storage/v1/object/public/profile-media/";
  const objectPath = imageUrl.split(marker)[1];
  if (objectPath) await supabase.storage.from("profile-media").remove([decodeURIComponent(objectPath)]).catch(() => undefined);
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function relationCount(value: unknown): number {
  if (!Array.isArray(value) || !value.length) return 0;
  const record = value[0] as { count?: number };
  return record.count ?? 0;
}

export async function fetchPosts(universityId?: string, groupId?: string): Promise<FeedPost[]> {
  const supabase = createClient();
  const build = (scopeGroups: boolean) => {
    let request = supabase
      .from("posts")
      .select(`
      id, body, image_url, tag, created_at, university_id,
      author:profiles!posts_author_id_fkey(
        id, auth_user_id, display_name, headline, avatar_url,
        university:universities!profiles_university_id_fkey(name)
      ),
      likes:post_likes(count),
      comments(count)
    `)
      .order("created_at", { ascending: false });
    if (universityId) request = request.eq("university_id", universityId);
    if (scopeGroups) request = groupId ? request.eq("group_id", groupId) : request.is("group_id", null);
    return request;
  };
  let { data, error } = await build(true);
  if (error && !groupId) ({ data, error } = await build(false));
  if (error) throw error;

  return (data ?? []).map((row, index) => {
    const authorRow = Array.isArray(row.author) ? row.author[0] : row.author;
    const universityRow = authorRow
      ? Array.isArray(authorRow.university)
        ? authorRow.university[0]
        : authorRow.university
      : null;
    const author: Person = {
      id: index + 1,
      profileId: authorRow?.id,
      isRegistered: Boolean(authorRow?.auth_user_id),
      name: authorRow?.display_name ?? "CONNECT member",
      role: authorRow?.headline ?? "University community member",
      school: universityRow?.name ?? "CONNECT community",
      avatar: authorRow?.avatar_url ?? uniqueAvatarUrl(authorRow?.display_name ?? "CONNECT member", index),
    };
    return {
      id: row.id,
      author,
      time: relativeTime(row.created_at),
      body: row.body,
      image: row.image_url ?? "",
      likes: relationCount(row.likes),
      comments: relationCount(row.comments),
      tag: row.tag,
      university: row.university_id ?? undefined,
    };
  });
}

export type PublicProfile = { person: Person; posts: FeedPost[] };

export async function fetchPublicProfile(profileId: string): Promise<PublicProfile> {
  const supabase = createClient();
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,auth_user_id,display_name,headline,bio,avatar_url,cover_url,university:universities!profiles_university_id_fkey(name)")
    .eq("id", profileId).single();
  if (profileError) throw profileError;
  const university = Array.isArray(profile.university) ? profile.university[0] : profile.university;
  const person: Person = { id: 0, profileId: profile.id, name: profile.display_name, role: profile.headline ?? "University member",
    school: university?.name ?? "CONNECT", avatar: profile.avatar_url ?? uniqueAvatarUrl(profile.display_name, 0),
    coverUrl: profile.cover_url ?? undefined, bio: profile.bio ?? "", isRegistered: Boolean(profile.auth_user_id) };
  const { data: postsData, error: postsError } = await supabase.from("posts")
    .select("id,body,image_url,tag,created_at,university_id,likes:post_likes(count),comments(count)")
    .eq("author_id", profileId).order("created_at", { ascending: false }).limit(20);
  if (postsError) throw postsError;
  const posts: FeedPost[] = (postsData ?? []).map(row => ({ id: row.id, author: person, time: relativeTime(row.created_at), body: row.body,
    image: row.image_url ?? "", likes: relationCount(row.likes), comments: relationCount(row.comments), tag: row.tag, university: row.university_id ?? undefined }));
  return { person, posts };
}

type GroupRow = { id: string; name: string; description: string; category: string; image_url: string | null; owner_id?: string | null; created_at?: string; icon_url?: string | null; rules?: string | null; members: unknown };

export async function fetchUniversityGroups(universityId = NUB_UNIVERSITY_ID): Promise<UniversityGroup[]> {
  const supabase = createClient();
  const base = "id, name, description, category, image_url, owner_id, created_at, members:group_members(count)";
  const query = (columns: string) => supabase.from("groups").select(columns).eq("university_id", universityId).in("visibility", ["public", "university"]).order("name");
  let result = await query(`${base}, icon_url, rules`);
  if (result.error) result = await query(base);
  if (result.error) throw result.error;

  return ((result.data ?? []) as unknown as GroupRow[]).map((group) => {
    const count = relationCount(group.members);
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      category: group.category,
      image: group.image_url ?? "",
      members: `${count} ${count === 1 ? "member" : "members"}`,
      memberCount: count,
      iconUrl: group.icon_url ?? undefined,
      rules: group.rules ?? "",
      ownerId: group.owner_id ?? undefined,
      createdAt: group.created_at,
    };
  });
}

export async function insertUniversityGroup(profileId: string, name: string, description: string, category: string, universityId = NUB_UNIVERSITY_ID) {
  const supabase = createClient();
  const { data, error } = await supabase.from("groups").insert({ owner_id: profileId, university_id: universityId, name, description, category, visibility: "university" }).select("id").single();
  if (error) throw error;
  const { error: memberError } = await supabase.from("group_members").insert({ group_id: data.id, profile_id: profileId });
  if (memberError) throw memberError;
  return data.id as string;
}

export async function fetchUniversityPeople(universityId = NUB_UNIVERSITY_ID, excludeProfileId?: string): Promise<Person[]> {
  let request = createClient().from("profiles")
    .select("id,auth_user_id,display_name,headline,avatar_url,department,study_year,interests,university:universities!profiles_university_id_fkey(name)")
    .eq("university_id", universityId).not("auth_user_id", "is", null).order("display_name");
  if (excludeProfileId) request = request.neq("id", excludeProfileId);
  const { data, error } = await request;
  if (error) throw error;
  // Fetch the viewer's own matching signals separately because they are excluded from results.
  let viewerDepartment = "";
  let viewerInterests: string[] = [];
  if (excludeProfileId) {
    const { data: viewer, error: viewerError } = await createClient().from("profiles").select("department,interests").eq("id", excludeProfileId).maybeSingle();
    if (viewerError) throw viewerError;
    viewerDepartment = viewer?.department?.trim().toLowerCase() ?? "";
    viewerInterests = viewer?.interests ?? [];
  }
  return (data ?? []).map((row, index) => {
    const university = Array.isArray(row.university) ? row.university[0] : row.university;
    return { id: index + 1, profileId: row.id, isRegistered: true, name: row.display_name, role: row.headline ?? "University member",
      school: university?.name ?? "Northern University Bangladesh", avatar: row.avatar_url ?? uniqueAvatarUrl(row.display_name, index), tag: "Student",
      department: row.department ?? "", studyYear: row.study_year ?? "", interests: row.interests ?? [] };
  }).sort((a, b) => {
    const score = (person: Person) => Number(Boolean(viewerDepartment && person.department?.trim().toLowerCase() === viewerDepartment)) * 3
      + (person.interests ?? []).filter(item => viewerInterests.some(interest => interest.toLowerCase() === item.toLowerCase())).length;
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });
}

export async function fetchFollowedProfileIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("follows").select("followed_id").eq("follower_id", profileId);
  if (error) throw error;
  return (data ?? []).map(row => row.followed_id as string);
}

export async function setFollow(profileId: string, targetProfileId: string, following: boolean) {
  const result = following
    ? await createClient().from("follows").insert({ follower_id: profileId, followed_id: targetProfileId })
    : await createClient().from("follows").delete().eq("follower_id", profileId).eq("followed_id", targetProfileId);
  if (result.error && !(following && result.error.code === "23505")) throw result.error;
}

export async function sendConnectionRequest(senderId: string, recipientId: string) {
  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase.from("connection_requests")
    .select("id,status").eq("sender_id", senderId).eq("recipient_id", recipientId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error(existing.status === "accepted" ? "You are already connected." : "A request has already been sent to this person.");
  const { data: incoming, error: incomingError } = await supabase.from("connection_requests")
    .select("id,status").eq("sender_id", recipientId).eq("recipient_id", senderId).maybeSingle();
  if (incomingError) throw incomingError;
  if (incoming?.status === "accepted") throw new Error("You are already connected.");
  if (incoming?.status === "pending") throw new Error("This person already sent you a request. Accept it from Notifications.");
  if (incoming) throw new Error("This person previously declined a request.");
  const { error } = await supabase.from("connection_requests").insert({ sender_id: senderId, recipient_id: recipientId });
  if (error) throw error;
}

export type ConnectionStatus = "pending_sent" | "pending_received" | "accepted" | "declined";
export type ConnectionStatusMap = Record<string, ConnectionStatus>;

export async function fetchConnectionStatuses(profileId: string): Promise<ConnectionStatusMap> {
  const supabase = createClient();
  const { data, error } = await supabase.from("connection_requests")
    .select("sender_id,recipient_id,status")
    .or(`sender_id.eq.${profileId},recipient_id.eq.${profileId}`);
  if (error) throw error;
  const map: ConnectionStatusMap = {};
  for (const row of data ?? []) {
    const otherId = row.sender_id === profileId ? row.recipient_id : row.sender_id;
    const status = row.status as ConnectionStatus;
    const previous = map[otherId];
    if (!previous) { map[otherId] = status; continue; }
    // Prefer the most informative state: an accepted connection beats a pending one, which beats a decline.
    if (status === "accepted" || previous === "accepted") map[otherId] = "accepted";
    else if (previous === "declined" && status !== "declined") map[otherId] = status;
  }
  return map;
}

export async function fetchConnectionCount(profileId: string): Promise<number> {
  const { data, error } = await createClient().rpc("get_connection_count", { target_profile_id: profileId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchMyConnections(profileId: string): Promise<Person[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("connection_requests")
    .select("sender_id,recipient_id")
    .eq("status", "accepted")
    .or(`sender_id.eq.${profileId},recipient_id.eq.${profileId}`);
  if (error) throw error;
  const otherIds = Array.from(new Set((data ?? []).map(row => row.sender_id === profileId ? row.recipient_id : row.sender_id)));
  if (!otherIds.length) return [];
  const { data: profiles, error: profilesError } = await supabase.from("profiles")
    .select("id,display_name,headline,avatar_url,university:universities!profiles_university_id_fkey(name)")
    .in("id", otherIds);
  if (profilesError) throw profilesError;
  return (profiles ?? []).map((row, index) => {
    const university = Array.isArray(row.university) ? row.university[0] : row.university;
    return { id: index + 1, profileId: row.id, isRegistered: true, name: row.display_name, role: row.headline ?? "University member",
      school: university?.name ?? "CONNECT", avatar: row.avatar_url ?? uniqueAvatarUrl(row.display_name, index), tag: "Connected" };
  });
}

export async function removeConnection(profileId: string, otherProfileId: string) {
  const { data, error } = await createClient().from("connection_requests")
    .delete()
    .eq("status", "accepted")
    .or(`and(sender_id.eq.${profileId},recipient_id.eq.${otherProfileId}),and(sender_id.eq.${otherProfileId},recipient_id.eq.${profileId})`)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Could not remove connection");
}

export type ChatMessage = { id: string; body: string; created_at: string; sender_id: string };
export type ChatConversation = { id: string; person: Person; lastMessage: string; updated_at: string };

export async function fetchMyConversations(profileId: string): Promise<ChatConversation[]> {
  const supabase = createClient();
  const { data: memberships, error } = await supabase.from("conversation_members").select("conversation_id").eq("profile_id", profileId);
  if (error) throw error;
  const rows: ChatConversation[] = [];
  for (const membership of memberships ?? []) {
    const { data: members, error: memberError } = await supabase.from("conversation_members")
      .select("profile_id,profile:profiles!conversation_members_profile_id_fkey(id,display_name,headline,avatar_url,university:universities!profiles_university_id_fkey(name))")
      .eq("conversation_id", membership.conversation_id).neq("profile_id", profileId).limit(1);
    if (memberError) throw memberError;
    const member = members?.[0];
    if (!member) continue;
    const personRow = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    if (!personRow) continue;
    const university = Array.isArray(personRow.university) ? personRow.university[0] : personRow.university;
    const { data: latest, error: latestError } = await supabase.from("messages").select("body,created_at")
      .eq("conversation_id", membership.conversation_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    rows.push({ id: membership.conversation_id, person: { id: rows.length + 1, profileId: personRow.id,
      name: personRow.display_name, role: personRow.headline ?? "University member", school: university?.name ?? "CONNECT", avatar: personRow.avatar_url ?? uniqueAvatarUrl(personRow.display_name, rows.length) },
      lastMessage: latest?.body ?? "Start a conversation", updated_at: latest?.created_at ?? "" });
  }
  return rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
}

export async function fetchConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await createClient().from("messages").select("id,body,created_at,sender_id")
    .eq("conversation_id", conversationId).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createConversation(profileId: string, recipientId: string): Promise<string> {
  const supabase = createClient();
  const { data: conversation, error } = await supabase.from("conversations").insert({ created_by: profileId }).select("id").single();
  if (error) throw error;
  const { error: membersError } = await supabase.from("conversation_members").insert([
    { conversation_id: conversation.id, profile_id: profileId }, { conversation_id: conversation.id, profile_id: recipientId },
  ]);
  if (membersError) throw membersError;
  return conversation.id as string;
}

export async function insertMessage(conversationId: string, senderId: string, body: string) {
  const { error } = await createClient().from("messages").insert({ conversation_id: conversationId, sender_id: senderId, body });
  if (error) throw error;
}

export async function fetchUniversityOpportunities(universityId = NUB_UNIVERSITY_ID): Promise<Opportunity[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, title, company, type, location, description, created_at")
    .eq("university_id", universityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    company: item.company,
    type: item.type === "Job" ? "Full-time" : item.type,
    location: item.location,
    detail: item.description,
    time: relativeTime(item.created_at),
  }));
}

export type EventRecord = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
};

export async function fetchUniversityEvents(universityId = NUB_UNIVERSITY_ID): Promise<EventRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at")
    .eq("university_id", universityId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (error) throw error;
  return data ?? [];
}

export async function insertPost(authorId: string, body: string, universityId = NUB_UNIVERSITY_ID, imageUrl?: string, audience: "public" | "university" = "university", groupId?: string) {
  const { data, error } = await createClient()
    .from("posts")
    .insert({ author_id: authorId, university_id: universityId, body, image_url: imageUrl ?? null, audience, tag: "Community", ...(groupId ? { group_id: groupId } : {}) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updatePost(postId: string, body: string) {
  const { error } = await createClient().from("posts").update({ body, updated_at: new Date().toISOString() }).eq("id", postId);
  if (error) throw error;
}

export async function deletePost(postId: string) {
  const supabase = createClient();
  const { data: post } = await supabase.from("posts").select("image_url").eq("id", postId).maybeSingle();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  const marker = "/storage/v1/object/public/profile-media/";
  const imageUrl = post?.image_url;
  if (user && imageUrl?.includes(marker)) {
    const objectPath = decodeURIComponent(imageUrl.split(marker)[1].split(/[?#]/)[0]);
    if (objectPath.startsWith(`${user.id}/posts/`)) await supabase.storage.from("profile-media").remove([objectPath]).catch(() => undefined);
  }
}

export async function registerForEvent(eventId: string, profileId: string, registered: boolean) {
  const supabase = createClient();
  const result = registered
    ? await supabase.from("event_registrations").insert({ event_id: eventId, profile_id: profileId })
    : await supabase.from("event_registrations").delete().eq("event_id", eventId).eq("profile_id", profileId);
  if (result.error && !(registered && result.error.code === "23505")) throw result.error;
}

export async function fetchRegisteredEventIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("event_registrations").select("event_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map(row => row.event_id as string);
}

export async function applyForOpportunity(opportunityId: string, profileId: string) {
  const { error } = await createClient().from("opportunity_applications").insert({ opportunity_id: opportunityId, applicant_id: profileId });
  if (error && error.code !== "23505") throw error;
}

export async function fetchMyApplicationOpportunityIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("opportunity_applications").select("opportunity_id").eq("applicant_id", profileId);
  if (error) throw error;
  return (data ?? []).map(row => row.opportunity_id as string);
}

export type PostComment = { id: string; body: string; created_at: string; author: Person };

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await createClient()
    .from("comments")
    .select("id, body, created_at, author:profiles!comments_author_id_fkey(display_name,headline,avatar_url)")
    .eq("post_id", postId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row, index) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    const name = author?.display_name ?? "CONNECT member";
    return {
      id: row.id,
      body: row.body,
      created_at: row.created_at,
      author: {
        id: index,
        name,
        role: author?.headline ?? "Community member",
        school: "CONNECT community",
        avatar: author?.avatar_url ?? uniqueAvatarUrl(name, index),
      },
    };
  });
}

function uniqueAvatarUrl(name: string, seed: number) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
  const tone = (seed * 37) % 28 + 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="hsl(230 5% ${tone}%)"/><text x="50" y="57" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export async function insertComment(postId: string, authorId: string, body: string) {
  const { error } = await createClient().from("comments").insert({ post_id: postId, author_id: authorId, body });
  if (error) throw error;
}

export async function setPostLike(postId: string, profileId: string, liked: boolean) {
  const supabase = createClient();
  const result = liked
    ? await supabase.from("post_likes").insert({ post_id: postId, profile_id: profileId })
    : await supabase.from("post_likes").delete().eq("post_id", postId).eq("profile_id", profileId);
  if (result.error && !(liked && result.error.code === "23505")) throw result.error;
}

export async function fetchPostLikeIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("post_likes").select("post_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => row.post_id as string);
}

export async function setPostSaved(postId: string, profileId: string, saved: boolean) {
  const supabase = createClient();
  const result = saved
    ? await supabase.from("saved_posts").insert({ post_id: postId, profile_id: profileId })
    : await supabase.from("saved_posts").delete().eq("post_id", postId).eq("profile_id", profileId);
  if (result.error && !(saved && result.error.code === "23505")) throw result.error;
}

export async function fetchSavedPostIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("saved_posts").select("post_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => row.post_id as string);
}

export async function fetchGroupMembershipNames(profileId: string): Promise<string[]> {
  const { data, error } = await createClient()
    .from("group_members")
    .select("groups(name)")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const group = row.groups as unknown as { name: string } | { name: string }[] | null;
    return Array.isArray(group) ? group[0]?.name : group?.name;
  }).filter((name): name is string => Boolean(name));
}

export async function fetchSavedGroupIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("saved_groups").select("group_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map(row => row.group_id as string);
}

export async function setGroupSaved(groupId: string, profileId: string, saved: boolean) {
  const result = saved
    ? await createClient().from("saved_groups").insert({ group_id: groupId, profile_id: profileId })
    : await createClient().from("saved_groups").delete().eq("group_id", groupId).eq("profile_id", profileId);
  if (result.error && !(saved && result.error.code === "23505")) throw result.error;
}

export async function setGroupMembership(groupId: string, profileId: string, joined: boolean) {
  const supabase = createClient();
  const result = joined
    ? await supabase.from("group_members").insert({ group_id: groupId, profile_id: profileId })
    : await supabase.from("group_members").delete().eq("group_id", groupId).eq("profile_id", profileId);
  if (result.error && !(joined && result.error.code === "23505")) throw result.error;
}

export async function setOpportunitySaved(opportunityId: string, profileId: string, saved: boolean) {
  const supabase = createClient();
  const result = saved
    ? await supabase.from("saved_opportunities").insert({ opportunity_id: opportunityId, profile_id: profileId })
    : await supabase.from("saved_opportunities").delete().eq("opportunity_id", opportunityId).eq("profile_id", profileId);
  if (result.error && !(saved && result.error.code === "23505")) throw result.error;
}

export async function fetchSavedOpportunityIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("saved_opportunities").select("opportunity_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => row.opportunity_id as string);
}

export type ActivityNotification = { id: string; kind: string; body: string; read_at: string | null; created_at: string; actor: Person };

export async function fetchNotifications(profileId: string): Promise<ActivityNotification[]> {
  const { data, error } = await createClient().from("notifications")
    .select("id,kind,body,read_at,created_at,actor:profiles!notifications_actor_id_fkey(id,display_name,headline,avatar_url)")
    .eq("recipient_id", profileId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((row, index) => {
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
    const name = actor?.display_name ?? "CONNECT";
    return { id: row.id, kind: row.kind, body: row.body, read_at: row.read_at, created_at: row.created_at,
      actor: { id: index, profileId: actor?.id, name, role: actor?.headline ?? "Community member", school: "CONNECT community", avatar: actor?.avatar_url ?? uniqueAvatarUrl(name, index) } };
  });
}

export async function respondToConnectionRequest(recipientId: string, senderId: string, accepted: boolean) {
  const { error } = await createClient().from("connection_requests")
    .update({ status: accepted ? "accepted" : "declined", updated_at: new Date().toISOString() })
    .eq("recipient_id", recipientId).eq("sender_id", senderId).eq("status", "pending");
  if (error) throw error;
}

export async function markNotificationsRead(profileId: string, ids?: string[]) {
  let query = createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", profileId).is("read_at", null);
  if (ids?.length) query = query.in("id", ids);
  const { error } = await query;
  if (error) throw error;
}

// ---------- Campus servers ----------
export type ServerMember = { profileId: string; name: string; headline: string; avatar: string; department: string; role: string; joinedAt: string };
export type ServerMessage = { id: string; body: string; createdAt: string; senderId: string; senderName: string; senderAvatar: string };

export async function uploadServerImage(file: File, kind: "icon" | "banner"): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("Your session expired.");
  const path = `${user.id}/servers/${kind}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("profile-media").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
}

export async function createServer(profileId: string, universityId: string, values: { name: string; description: string; category: string; rules?: string; iconUrl?: string; imageUrl?: string }) {
  const supabase = createClient();
  const row: Record<string, unknown> = { owner_id: profileId, university_id: universityId, name: values.name, description: values.description, category: values.category, visibility: "university" };
  if (values.rules) row.rules = values.rules;
  if (values.iconUrl) row.icon_url = values.iconUrl;
  if (values.imageUrl) row.image_url = values.imageUrl;
  const { data, error } = await supabase.from("groups").insert(row).select("id").single();
  if (error) throw error;
  const { error: memberError } = await supabase.from("group_members").insert({ group_id: data.id, profile_id: profileId });
  if (memberError) throw memberError;
  return data.id as string;
}

export async function updateServer(groupId: string, values: { name: string; description: string; category: string; rules: string; iconUrl?: string; imageUrl?: string }) {
  const row: Record<string, unknown> = { name: values.name, description: values.description, category: values.category, rules: values.rules };
  if (values.iconUrl) row.icon_url = values.iconUrl;
  if (values.imageUrl) row.image_url = values.imageUrl;
  const { error } = await createClient().from("groups").update(row).eq("id", groupId);
  if (error) throw error;
}

export async function fetchMyGroupIds(profileId: string): Promise<string[]> {
  const { data, error } = await createClient().from("group_members").select("group_id").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).map((row) => row.group_id as string);
}

export async function fetchGroupMembers(groupId: string): Promise<ServerMember[]> {
  const { data, error } = await createClient()
    .from("group_members")
    .select("role, joined_at, profile:profiles(id, display_name, headline, avatar_url, department)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  type Row = { role: string; joined_at: string; profile: unknown };
  return ((data ?? []) as unknown as Row[]).flatMap((row, index) => {
    const raw = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    const profile = raw as { id: string; display_name: string | null; headline: string | null; avatar_url: string | null; department: string | null } | null;
    if (!profile) return [];
    const name = profile.display_name ?? "CONNECT member";
    return [{ profileId: profile.id, name, headline: profile.headline ?? "", avatar: profile.avatar_url ?? uniqueAvatarUrl(name, index), department: profile.department ?? "", role: row.role, joinedAt: row.joined_at }];
  });
}

export async function fetchGroupMessages(groupId: string, limit = 100): Promise<ServerMessage[]> {
  const { data, error } = await createClient()
    .from("group_messages")
    .select("id, body, created_at, sender_id, sender:profiles(id, display_name, avatar_url)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = { id: string; body: string; created_at: string; sender_id: string; sender: unknown };
  return ((data ?? []) as unknown as Row[]).reverse().map((row, index) => {
    const raw = Array.isArray(row.sender) ? row.sender[0] : row.sender;
    const sender = raw as { display_name: string | null; avatar_url: string | null } | null;
    const name = sender?.display_name ?? "CONNECT member";
    return { id: row.id, body: row.body, createdAt: row.created_at, senderId: row.sender_id, senderName: name, senderAvatar: sender?.avatar_url ?? uniqueAvatarUrl(name, index) };
  });
}

export async function sendGroupMessage(groupId: string, senderId: string, body: string) {
  const { error } = await createClient().from("group_messages").insert({ group_id: groupId, sender_id: senderId, body });
  if (error) throw error;
}

export async function deleteGroupMessage(messageId: string) {
  const { error } = await createClient().from("group_messages").delete().eq("id", messageId);
  if (error) throw error;
}
