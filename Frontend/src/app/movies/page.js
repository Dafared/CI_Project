"use client";

import { useState, useEffect, Suspense } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiService } from "@/lib/api-config";
import { SearchBar } from "@/components/ui/searchbar";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

export default function MoviesPage() {
  const router = useRouter();
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("movie");

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const response = await apiService.fetchData('/movies');
        if (response.ok) {
          const data = await response.json();
          const sortedMovies = data.sort((a, b) => a.title.localeCompare(b.title));
          setMovies(sortedMovies);
        }
      } catch (error) {
        console.error('Failed to fetch movies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, []);

  const handleNavigation = (path) => {
    router.push(path);
  };

  const handleSearch = (query) => {
    router.push(`/?q=${encodeURIComponent(query)}&type=movie`);
  };

  const handleTypeChange = (newType) => {
    setSearchType(newType);
    setSearchQuery("");
    // If type changes, navigate to the appropriate page
    if (newType === "actor") {
      handleNavigation("/actors");
    }
  };

  const filteredMovies = movies.filter(movie =>
    movie.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <Card className="max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>All Movies</CardTitle>
              <p className="text-gray-500 mt-2">({movies.length} movies)</p>
            </div>
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                className="flex items-center gap-2"
                onClick={() => handleNavigation('/')}
              >
                <MagnifyingGlassIcon size={16} />
                Back to Home
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <Suspense>
              <SearchBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchType={searchType}
                onSearch={handleSearch}
                onTypeChange={handleTypeChange}
                placeholder="Filter movies or search for details..."
              />
            </Suspense>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto pr-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMovies.map((movie, index) => (
                  <Card 
                    key={index}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleNavigation(`/?q=${encodeURIComponent(movie.title)}&type=movie`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold">{movie.title}</h3>
                        {movie.year && (
                          <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                            {movie.year}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        Click to see cast
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 