interface PostCardProps {
  post: {
    id: string;
    text: string;
    images: string[];
    likes: number;
    comments: number;
    reposts: number;
  };
  profile: {
    name: string;
    verified: boolean;
    avatar: string;
  };
  onOpenDetail?: (postId: string) => void;
}

export function PostCard({ post, profile, onOpenDetail }: PostCardProps) {
  return (
    <article className="bg-white px-4 py-3 border-b border-gray-100" data-track="feed_post" data-track-id={post.id}>
      <div className="flex items-start gap-3">
        <img src={profile.avatar} alt={profile.name} className="h-10 w-10 rounded-full object-cover" />

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1 text-sm">
            <span className="font-semibold text-gray-900">{profile.name}</span>
            {profile.verified ? (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#4d93ff] text-[10px] text-white">
                V
              </span>
            ) : null}
          </div>

          <button
            type="button"
            className="block w-full text-left text-[17px] leading-8 text-gray-900"
            data-track="open_post_detail"
            data-track-id={post.id}
            onClick={() => onOpenDetail?.(post.id)}
          >
            {post.text}
          </button>

          {post.images.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {post.images.slice(0, 3).map((img, idx) => (
                <img
                  key={`${post.id}-img-${idx}`}
                  src={img}
                  alt="post"
                  className="aspect-square w-full rounded-md object-cover"
                />
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
            <button type="button" data-track="click_repost" data-track-id={post.id}>
              转发 {post.reposts}
            </button>
            <button type="button" data-track="click_comment" data-track-id={post.id}>
              评论 {post.comments}
            </button>
            <button type="button" data-track="click_like" data-track-id={post.id}>
              赞 {post.likes}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
