import { useState, useEffect } from 'react';
import { Film, User, RefreshCw, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { apiService } from '@/lib/api-config';

// Simple Notification component
const Notification = ({ message, type, onClose }) => (
  <div className={`
    fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-2
    ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
  `}>
    <span>{message}</span>
    <button 
      onClick={onClose}
      className="p-1 hover:bg-white/20 rounded-full"
    >
      <X className="w-4 h-4" />
    </button>
  </div>
);

const DetailsCard = ({ data, type, onDataUpdate }) => {
  const [posterUrl, setPosterUrl] = useState(null);
  const [isLoadingPoster, setIsLoadingPoster] = useState(false);
  const [isUpdatingActor, setIsUpdatingActor] = useState(false);
  const [notification, setNotification] = useState(null);
  const [actorData, setActorData] = useState(data);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  // Refresh actor data from backend
  const refreshActorData = async (actorName) => {
    try {
      const response = await apiService.fetchData(
        `/actors/${encodeURIComponent(actorName)}/filmography`
      );
      if (response.ok) {
        const newData = await response.json();
        setActorData(newData);
        if (onDataUpdate) {
          onDataUpdate(newData);
        }
      }
    } catch (error) {
      console.error('Error refreshing actor data:', error);
    }
  };

  const updateActorData = async (actorName) => {
    setIsUpdatingActor(true);
    try {
      const updateResponse = await apiService.putData(
        `/actor/update/${encodeURIComponent(actorName)}`
      );
      
      if (updateResponse.ok) {
        await refreshActorData(actorName);
        showNotification('Actor information updated successfully');
      } else {
        throw new Error('Failed to update actor information');
      }
    } catch (error) {
      console.error('Error updating actor data:', error);
      showNotification('Failed to update actor information', 'error');
    } finally {
      setIsUpdatingActor(false);
    }
  };

  // Update local state when props change
  useEffect(() => {
    if (JSON.stringify(data) !== JSON.stringify(actorData)) {
      setActorData(data);
    }
  }, [data]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  const calculateAge = (birthDate, deathDate) => {
    if (!birthDate) return null;
    
    const birth = new Date(birthDate);
    const end = deathDate ? new Date(deathDate) : new Date();
    
    let age = end.getFullYear() - birth.getFullYear();
    const monthDiff = end.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  if (!data) return null;

  // Actor Card
  if (type === 'actor' && actorData?.actor && actorData?.movies) {
    const { actor, movies, directors } = actorData;
    
    return (
      <>
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}
        
        <Card className="mb-4">
          <CardContent className="p-6">
            <div className="flex gap-6">
              <div className="flex-shrink-0 w-32 h-40 relative">
                {actor?.photo_path ? (
                  <img
                    src={actor.photo_path}
                    alt={actor.name}
                    className="w-full h-full object-cover rounded-lg shadow-md"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold">{actor.name}</h2>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-gray-500">Movies</span>
                    <span className="font-medium text-lg">{movies.length}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-gray-500">Directors</span>
                    <span className="font-medium text-lg">{directors ? directors.length : 0}</span>
                  </div>
                </div>
                {movies && movies.length > 0 && (
                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <span className="text-gray-500">Latest Movie</span>
                    <p className="font-medium">
                      {movies[0].title} {movies[0].release_date && `(${movies[0].release_date})`}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">First Movie</span>
                    <p className="font-medium">
                      {movies[movies.length - 1].title} {movies[movies.length - 1].release_date && `(${movies[movies.length - 1].release_date})`}
                    </p>
                  </div>
                </div>
              )}
              </div>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (type === 'movie' && data.movie && data.actors) {
    const { movie, actors, directors } = data;
    return (
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex gap-6">
            <div className="flex-shrink-0 w-48 h-72 relative">
              {isLoadingPoster ? (
                <div className="w-full h-full bg-gray-200 animate-pulse rounded-lg" />
              ) : movie?.cover_path ? (
                <img
                  src={movie.cover_path}
                  alt={movie.title}
                  className="w-full h-full object-cover rounded-lg shadow-md"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
                  <Film className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{movie.title}</h2>
                  <p className="text-gray-600">
                    <span className="font-medium">English Title:</span> {movie.english_title || 'N/A'}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Release Date:</span> {movie.release_date || 'Unknown'}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-medium">Genres:</span> {movie.genres ? movie.genres.join(', ') : 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Cast</h3>
                <div className="flex flex-wrap gap-2">
                  {actors.map((actor, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800"
                    >
                      {actor.name}
                    </span>
                  ))}
                </div>
              </div>

              {directors && directors.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Directors</h3>
                  <div className="flex flex-wrap gap-2">
                    {directors.map((director, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800"
                      >
                        {director.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === 'director' && data.director) {
    const { director, movies, actors } = data;
    return (
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex gap-6">
            <div className="flex-shrink-0 w-32 h-40 relative">
              {director.photo_path ? (
                <img
                  src={director.photo_path}
                  alt={director.name}
                  className="w-full h-full object-cover rounded-lg shadow-md"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
                  <User className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{director.name}</h2>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-gray-500">Movies</span>
                    <span className="font-medium text-lg">{movies ? movies.length : 0}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-sm text-gray-500">Actors</span>
                    <span className="font-medium text-lg">{actors ? actors.length : 0}</span>
                  </div>
                </div>
              </div>
              {movies && movies.length > 0 && (
                <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                  <div>
                    <span className="text-gray-500">Latest Movie</span>
                    <p className="font-medium">
                      {movies[0].title} {movies[0].release_date && `(${movies[0].release_date})`}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">First Movie</span>
                    <p className="font-medium">
                      {movies[movies.length - 1].title} {movies[movies.length - 1].release_date && `(${movies[movies.length - 1].release_date})`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};

export { DetailsCard };