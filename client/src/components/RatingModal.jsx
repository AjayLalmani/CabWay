import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { submitReview } from '../lib/api';

export default function RatingModal({ ride, onClose }) {
  const { getToken } = useAuth();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) return alert('Please select a star rating');

    setSubmitting(true);
    try {
      const token = await getToken();
      await submitReview(token, ride.id, rating, comment);
      setSuccess(true);
      setTimeout(onClose, 2000); // close after 2 seconds
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">How was your ride?</h2>
          <p className="text-gray-500 mt-1">
            Rate your driver to help us improve the CabWay experience.
          </p>
        </div>

        {success ? (
          <div className="py-8 text-center text-green-600 font-medium">
            <div className="text-4xl mb-4">🎉</div>
            Thank you for your feedback!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex justify-center gap-2">
              {[...Array(5)].map((_, index) => {
                index += 1;
                return (
                  <button
                    type="button"
                    key={index}
                    className={`p-1 transition-transform hover:scale-110 focus:outline-none`}
                    onClick={() => setRating(index)}
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover(rating)}
                  >
                    <Star
                      size={40}
                      className={
                        index <= (hover || rating)
                          ? 'fill-yellow-400 text-yellow-500'
                          : 'fill-gray-100 text-gray-300'
                      }
                    />
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="comment" className="text-sm font-medium text-gray-700">
                Leave a comment (Optional)
              </label>
              <textarea
                id="comment"
                rows="3"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 text-gray-700 focus:ring-2 focus:ring-black focus:border-black outline-none resize-none"
                placeholder="Great driving, very polite..."
              ></textarea>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={submitting || rating === 0}
                className="flex-1 py-3 px-4 rounded-lg font-medium bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
