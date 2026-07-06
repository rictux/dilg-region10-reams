import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FeatureAnnouncement } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

// Presentational card shared by the real login modal and the admin preview in
// Settings → Announcements, so the preview always matches what users see.
export type AnnouncementCardData = Pick<FeatureAnnouncement, 'title' | 'description' | 'type'>;

export const AnnouncementModalCard: React.FC<{
  announcement: AnnouncementCardData;
  position: number;
  total: number;
  onDismiss: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}> = ({ announcement, position, total, onDismiss, onNext, onPrev }) => {
  const typeIcon = announcement.type === 'warning' ? (
    <AlertCircle className="w-8 h-8 text-yellow-500" />
  ) : announcement.type === 'success' ? (
    <CheckCircle className="w-8 h-8 text-green-500" />
  ) : (
    <Info className="w-8 h-8 text-blue-500" />
  );

  const bgColor = announcement.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                  announcement.type === 'success' ? 'bg-green-50 border-green-200' :
                  'bg-blue-50 border-blue-200';

  return (
    <div className={`${bgColor} border rounded-lg shadow-xl max-w-md w-full`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          {typeIcon}
          <h2 className="text-xl font-semibold text-gray-900">{announcement.title}</h2>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <p className="text-gray-700 whitespace-pre-wrap">{announcement.description}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t rounded-b-lg">
        <div className="text-sm text-gray-600">
          {position} of {total}
        </div>

        <div className="flex gap-2">
          {position > 1 && (
            <button
              onClick={onPrev}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
            >
              Previous
            </button>
          )}
          {position < total ? (
            <button
              onClick={onNext}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onDismiss}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition"
            >
              Got It
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AnnouncementModal: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<FeatureAnnouncement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUnviewedAnnouncements();
    }
  }, [user]);

  const fetchUnviewedAnnouncements = async () => {
    try {
      setLoading(true);

      // Get active announcements that the user hasn't viewed
      const { data, error } = await supabase
        .from('feature_announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && user) {
        // Filter out announcements the user has already seen
        const { data: viewedIds } = await supabase
          .from('announcement_views')
          .select('announcement_id')
          .eq('user_id', user.user_id);

        const viewedSet = new Set(viewedIds?.map(v => v.announcement_id) || []);
        const unviewed = data.filter(a => !viewedSet.has(a.id));

        setAnnouncements(unviewed);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('Error fetching announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    if (!user || announcements.length === 0) return;

    const current = announcements[currentIndex];

    try {
      // Mark announcement as viewed
      await supabase
        .from('announcement_views')
        .insert([{
          announcement_id: current.id,
          user_id: user.user_id
        }]);

      // Move to next or close if last
      if (currentIndex < announcements.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setAnnouncements([]);
      }
    } catch (err) {
      console.error('Error marking announcement as viewed:', err);
    }
  };

  const handleNext = () => {
    if (currentIndex < announcements.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (loading || announcements.length === 0 || !user) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <AnnouncementModalCard
        announcement={announcements[currentIndex]}
        position={currentIndex + 1}
        total={announcements.length}
        onDismiss={handleDismiss}
        onNext={handleNext}
        onPrev={handlePrev}
      />
    </div>
  );
};

export default AnnouncementModal;
