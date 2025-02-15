import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, User, Film } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiService } from '@/lib/api-config';

const SearchBar = ({ 
  searchQuery, 
  setSearchQuery, 
  searchType, 
  onSearch, 
  onTypeChange 
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const lastQuery = useRef(searchQuery);
  const loadingTimeoutRef = useRef(null);
  const wrapperRef = useRef(null);

  const cleanupLoading = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const safeSetLoading = useCallback((value) => {
    cleanupLoading();
    if (value) {
      loadingTimeoutRef.current = setTimeout(() => {
        setIsLoading(true);
      }, 100);
    } else {
      setIsLoading(false);
    }
  }, [cleanupLoading]);

  const fetchResults = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSuggestions([]);
      return;
    }

    if (query === lastQuery.current) return;
    lastQuery.current = query;

    safeSetLoading(true);
    try {
      const response = await apiService.fetchData(
        `/search/${searchType}?query=${encodeURIComponent(query)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        // Filter out undefined or empty entries
        const validSuggestions = data.filter(suggestion => {
          const text = searchType === 'movie' ? suggestion.title : suggestion.name;
          return text && text.trim().length > 0;
        });
        setSuggestions(validSuggestions);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
      setSuggestions([]);
    } finally {
      safeSetLoading(false);
    }
  }, [searchType, safeSetLoading]);

  useEffect(() => {
    return () => {
      cleanupLoading();
    };
  }, [cleanupLoading]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(true);
  }, [setSearchQuery]);

  const handleSuggestionClick = useCallback((suggestion) => {
    const suggestionText = searchType === 'movie' ? suggestion.title : suggestion.name;
    setSearchQuery(suggestionText);
    setSuggestions([]);
    setShowSuggestions(false);
    onSearch(suggestionText);
  }, [setSearchQuery, onSearch, searchType]);

  const handleSearchClick = useCallback(() => {
    setShowSuggestions(false);
    if (suggestions.length > 0) {
      onSearch(searchQuery, suggestions);
    } else {
      onSearch(searchQuery);
    }
  }, [onSearch, searchQuery, suggestions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        fetchResults(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, fetchResults]);

  const renderSuggestions = useMemo(() => {
    if (!showSuggestions || !suggestions.length) return null;

    return (
      <Card className="absolute w-full mt-1 z-50 shadow-lg">
        <div className="max-h-[60vh] overflow-y-auto">
          <ul className="py-1">
            {suggestions.map((suggestion, index) => {
              const displayText = searchType === 'movie' 
                ? suggestion.title : suggestion.name;
                
              if (!displayText) return null;

              return (
                <li
                  key={index}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {searchType === 'actor' ? (
                        <User className="w-4 h-4 mr-2 text-gray-500" />
                      ) : (
                        <Film className="w-4 h-4 mr-2 text-gray-500" />
                      )}
                      <span className="truncate">{displayText}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
    );
  }, [showSuggestions, suggestions, searchType, handleSuggestionClick]);

  return (
    <div className="flex gap-4 mb-8 relative">
      <div className="flex-1 relative" ref={wrapperRef}>
        <Input
          placeholder={`Search for ${
            searchType === "actor"
              ? "an actor"
              : searchType === "movie"
              ? "a movie"
              : "a director"
          }...`}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearchClick();
            }
          }}
          className="w-full"
        />
        
        {renderSuggestions}
        
        {isLoading && (
          <div className="absolute right-3 top-2.5">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={searchType === "actor" ? "default" : "outline"}
          onClick={() => onTypeChange("actor")}
        >
          <User className="w-4 h-4 mr-2" />
          Actor
        </Button>
        <Button
          variant={searchType === "movie" ? "default" : "outline"}
          onClick={() => onTypeChange("movie")}
        >
          <Film className="w-4 h-4 mr-2" />
          Movie
        </Button>
        <Button
          variant={searchType === "director" ? "default" : "outline"}
          onClick={() => onTypeChange("director")}
        >
          <User className="w-4 h-4 mr-2" />
          Director
        </Button>
      </div>

      <Button onClick={handleSearchClick}>
        <Search className="w-4 h-4 mr-2" />
        Search
      </Button>
    </div>
  );
};

export { SearchBar };