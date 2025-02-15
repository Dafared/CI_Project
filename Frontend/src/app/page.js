"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { User, Film, DatabaseBackup } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchBar } from "@/components/ui/searchbar";
import { DetailsCard } from "@/components/ui/details";
import { apiService } from "@/lib/api-config";
import { WelcomeMessage } from "@/components/ui/welcome";

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <p>Loading Graph...</p>,
});

const CypherQueryDisplay = ({ query }) => {
  if (!query) return null;

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-gray-700">Current Cypher Query</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Click query to copy</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(query);
            }}
          >
            Copy
          </Button>
        </div>
      </div>
      <pre
        className="bg-white p-4 rounded-md overflow-x-auto text-sm font-mono text-gray-800"
        onClick={() => {
          navigator.clipboard.writeText(query);
        }}
        style={{ cursor: "pointer" }}
      >
        {query.split("\n").map((line, i) => (
          <div key={i} className="hover:bg-gray-50">
            {line}
          </div>
        ))}
      </pre>
    </div>
  );
};

const capitalizeWords = (str) => {
  // Check if string is mixed case (has both upper and lower case letters)
  const hasMixedCase = str !== str.toUpperCase() && str !== str.toLowerCase();
  
  // If mixed case, return original string unchanged
  if (hasMixedCase) {
    return str;
  }
  
  // Otherwise, apply the capitalization transformation
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const NotFoundMessage = ({ type, query, onAddActor }) => (
  <div className="text-center py-12">
    <div className="mb-4">
      <span className="text-6xl">🔍</span>
    </div>
    <h2 className="text-2xl font-bold mb-2">
      No {capitalizeWords(type)} Found
    </h2>
    <p className="text-gray-600 mb-6">
      We couldn't find any{" "}
      {type === "actor"
        ? "actor"
        : type === "director"
        ? "director"
        : "movie"}{" "}
      matching "{query}"
    </p>  
  </div>
);

export default function Home() {
  const router = useRouter();
  const ForceGraphRef = useRef();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("actor");
  const [searchResults, setSearchResults] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [currentQuery, setCurrentQuery] = useState("");
  const [showCypherQuery, setShowCypherQuery] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const [hasActors, setHasActors] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [toast, setToast] = useState(null);


  // Initialize state from URL on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    const type = params.get("type");

    if (query) {
      setSearchQuery(query);
      setSearchType(type || "actor");
      handleSearch(query, type || "actor");
    }
  }, []);

  // Update URL when search is performed
  const updateURL = (query, type) => {
    const params = new URLSearchParams();
    const formattedQuery = type === "actor" ? capitalizeWords(query) : query;
    params.set("q", formattedQuery);
    params.set("type", type);
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  const transformToGraphData = (data, type) => {
    const nodes = [];
    const links = [];
    
    if (type === "actor" && data?.actor && data?.movies) {
      const actorId = data.actor.name + "-self";
      // 处理演员：中心节点为演员
      nodes.push({
        id: actorId,
        name: data.actor.name,
        type: "actor",
        val: 45,
        collisionRadius: 80,
      });
      
      // 添加演员与电影之间的关系
      data.movies.slice(0, 29).forEach((movie) => {
        // 避免重复添加相同电影节点
        if (!nodes.find(n => n.id === movie.title)) {
          nodes.push({
            id: movie.title,
            name: movie.title,
            type: "movie",
            val: 40,
            release_date: movie.release_date,
            collisionRadius: 75,
          });
        }
        links.push({
          source: actorId,
          target: movie.title,
          distance: 500,
        });
      });
      
      // 添加演员与导演之间的合作关系（如果返回了合作导演数据）
      if (data.directors && data.directors.length > 0) {
        data.directors.forEach((director) => {
          if (!nodes.find(n => n.id === director.name)) {
            nodes.push({
              id: director.name,
              name: director.name,
              type: "director",
              val: 40,
              collisionRadius: 75,
            });
          }
          links.push({
            source: actorId,
            target: director.name,
            distance: 500,
          });
        });
      }
    } else if (type === "movie" && data?.movie && data?.actors) {
      // 处理电影：中心节点为电影
      nodes.push({
        id: data.movie.title,
        name: data.movie.title,
        type: "movie",
        val: 45,
        release_date: data.movie.release_date,
        collisionRadius: 80,
      });
      
      // 添加电影与演员之间的关系
      data.actors.slice(0, 29).forEach((actor) => {
        if (!nodes.find(n => n.id === actor.name)) {
          nodes.push({
            id: actor.name,
            name: actor.name,
            type: "actor",
            val: 40,
            collisionRadius: 75,
          });
        }
        links.push({
          source: data.movie.title,
          target: actor.name,
          distance: 500,
        });
      });
      
      // 添加电影与导演之间的关系（如果返回了导演数据）
      if (data.directors && data.directors.length > 0) {
        data.directors.forEach((director) => {
          // 始终为导演节点生成一个独特 id
          const directorId = director.name + "-director";
          
          // 如果导演节点已经添加过，则不重复添加
          if (!nodes.find(n => n.id === directorId)) {
            nodes.push({
              id: directorId,
              name: director.name,
              type: "director",
              val: 40,
              collisionRadius: 75,
            });
          }
          // 建立链接时也使用 directorId
          links.push({
            source: data.movie.title,  // 或者 data.actor.name，根据不同视角
            target: directorId,
            distance: 500,
          });
        });
      }
      
    } else if (type === "director" && data?.director) {
      // 处理导演：中心节点为导演
      const directorId = data.director.name + "-self";
      nodes.push({
        id: directorId,
        name: data.director.name,
        type: "director",
        val: 45,
        collisionRadius: 80,
      });
      
      // 添加导演与电影之间的关系
      if (data.movies && data.movies.length > 0) {
        data.movies.slice(0, 29).forEach((movie) => {
          if (!nodes.find(n => n.id === movie.title)) {
            nodes.push({
              id: movie.title,
              name: movie.title,
              type: "movie",
              val: 40,
              release_date: movie.release_date,
              collisionRadius: 75,
            });
          }
          links.push({
            source: directorId,
            target: movie.title,
            distance: 500,
          });
        });
      }
      // 添加导演与演员之间的关系
      if (data.actors && data.actors.length > 0) {
        data.actors.slice(0, 29).forEach((actor) => {
          if (!nodes.find(n => n.id === actor.name)) {
            nodes.push({
              id: actor.name,
              name: actor.name,
              type: "actor",
              val: 40,
              collisionRadius: 75,
            });
          }
          links.push({
            source: directorId,
            target: actor.name,
            distance: 500,
          });
        });
      }
    }
    
    return { nodes, links };
  };  
  
  const handleTypeChange = (newType) => {
    setSearchType(newType);
    setSearchQuery("");
    setSelectedNode(null);
    setSearchResults(null);
    setGraphData({ nodes: [], links: [] });
    setCurrentQuery("");
    setNotFound(false);
    setLastSearchedQuery("");

    router.push("/", { scroll: false });
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q");
      const type = params.get("type");

      if (query) {
        setSearchQuery(query);
        setSearchType(type || "actor");
        handleSearch(query, type || "actor");
      } else {
        // Reset state when navigating to empty URL
        setSearchQuery("");
        setSearchType("actor");
        setSelectedNode(null);
        setSearchResults(null);
        setGraphData({ nodes: [], links: [] });
        setCurrentQuery("");
        setNotFound(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const checkForActors = async () => {
      try {
        const response = await apiService.fetchData("/actors");
        const data = await response.json();
        setHasActors(data && data.length > 0);
      } catch (error) {
        console.error("Error checking for actors:", error);
        setHasActors(false);
      }
    };

    checkForActors();
  }, []);

  const handleImportData = async () => {
    setIsSeeding(true);
    const startTime = Date.now();

    setToast({
      title: 'Import Data',
      description: 'Adding actors,films and directors to Neo4j from dataset',
      loading: true
    });
  
    try {
      const response = await apiService.postData('/import');
      if (response.ok) {
        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Show success toast
        setToast({
          title: 'Database initialized successfully',
          loading: false
        });
        
        // Clear toast after 5 seconds
        setTimeout(() => setToast(null), 5000);
        setHasActors(true);
      }
    } catch (error) {
      console.error('Error DB Initialization:', error);
      setToast({
        title: 'Seeding Failed',
        description: 'Please try again',
        loading: false
      });
      setTimeout(() => setToast(null), 3000);
      setError('Failed to initialize DB. Please try again.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleBulkImportData = async () => {
    setIsSeeding(true);
    const startTime = Date.now();

    setToast({
      title: 'Import Data',
      description: 'Adding actors,films and directors to Neo4j from dataset',
      loading: true
    });
  
    try {
      const response = await apiService.postData('/bulk_import');
      if (response.ok) {
        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // Show success toast
        setToast({
          title: 'Database initialized successfully',
          loading: false
        });
        
        // Clear toast after 5 seconds
        setTimeout(() => setToast(null), 5000);
        setHasActors(true);
      }
    } catch (error) {
      console.error('Error DB Initialization:', error);
      setToast({
        title: 'Seeding Failed',
        description: 'Please try again',
        loading: false
      });
      setTimeout(() => setToast(null), 3000);
      setError('Failed to initialize DB. Please try again.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearDB = async () => {
    try {
      const response = await apiService.postData('/clear');
      if (response.ok) {
        alert("DB cleared!");
      } else {
        alert("Failed to clear DB");
      }
    } catch (error) {
      console.error("Error clearing DB:", error);
      alert("Error clearing DB");
    }
  };

  const handleSearch = async (query = searchQuery, type = searchType) => {
    if (!query.trim()) return;
  
    const formattedQuery = query;
  
    // 更新 URL 参数,保持状态同步
    const params = new URLSearchParams();
    params.set("q", formattedQuery);
    params.set("type", type);
    window.history.pushState({}, "", `/?${params.toString()}`);
  
    setLoading(true);
    setError(null);
    setNotFound(false);
    setSelectedNode(null);
    setLastSearchedQuery(formattedQuery);
    updateURL(formattedQuery, type);
  
    let cypherQuery = "";
    let combinedData = null;
  
    try {
      if (type === "actor") {
        // 查询演员时,需要获取演员影史和合作过的导演列表
        const [filmographyResponse, directorsResponse] = await Promise.all([
          apiService.fetchData(
            `/actors/${encodeURIComponent(formattedQuery)}/filmography`
          ),
          apiService.fetchData(
            `/actors/${encodeURIComponent(formattedQuery)}/directors`
          ),
        ]);
  
        if (filmographyResponse.status === 404 || directorsResponse.status === 404) {
          setNotFound(true);
          setSearchResults(null);
          setGraphData({ nodes: [], links: [] });
          setLoading(false);
          return;
        }
        if (!filmographyResponse.ok || !directorsResponse.ok) {
          throw new Error("Search failed");
        }
        const filmographyData = await filmographyResponse.json(); // { actor, movies }
        const directorsData = await directorsResponse.json();       // { actor, directors }
        // 合并数据,确保 actor 信息一致,并增加 directors 字段
        combinedData = { ...filmographyData, directors: directorsData.directors };
  
        cypherQuery = `
          MATCH (a:Actor {name: "${formattedQuery}"})-[:ACTED_IN]->(m:Movie)
          WITH a as actor, m
          ORDER BY m.year DESC, m.title
          WITH actor, collect(m) as movies
          RETURN actor, movies
        `;
      } else if (type === "movie") {
        // 查询电影时,需要获取演员阵容和电影的导演列表
        const [castResponse, directorsResponse] = await Promise.all([
          apiService.fetchData(
            `/movies/${encodeURIComponent(formattedQuery)}/cast`
          ),
          apiService.fetchData(
            `/movies/${encodeURIComponent(formattedQuery)}/directors`
          ),
        ]);
  
        if (castResponse.status === 404 || directorsResponse.status === 404) {
          setNotFound(true);
          setSearchResults(null);
          setGraphData({ nodes: [], links: [] });
          setLoading(false);
          return;
        }
        if (!castResponse.ok || !directorsResponse.ok) {
          throw new Error("Search failed");
        }
        const castData = await castResponse.json();             // { movie, actors }
        const directorsData = await directorsResponse.json();   // { movie, directors }
        // 合并数据,将导演列表加入返回数据中
        combinedData = { ...castData, directors: directorsData.directors };
  
        cypherQuery = `
          MATCH (m:Movie {title: "${formattedQuery}"})
          OPTIONAL MATCH (a:Actor)-[:ACTED_IN]->(m)
          WITH m as movie, collect(a) as actors
          ORDER BY a.name
          WITH movie, collect(a) as actors
          RETURN movie, actors
        `;
      } else if (type === "director") {
        // 查询导演时,需要获取导演执导过的电影列表以及合作过的演员列表
        const [filmographyResponse, actorsResponse] = await Promise.all([
          apiService.fetchData(
            `/directors/${encodeURIComponent(formattedQuery)}/filmography`
          ),
          apiService.fetchData(
            `/directors/${encodeURIComponent(formattedQuery)}/actors`
          ),
        ]);
  
        if (filmographyResponse.status === 404 || actorsResponse.status === 404) {
          setNotFound(true);
          setSearchResults(null);
          setGraphData({ nodes: [], links: [] });
          setLoading(false);
          return;
        }
        if (!filmographyResponse.ok || !actorsResponse.ok) {
          throw new Error("Search failed");
        }
        const filmographyData = await filmographyResponse.json(); // { director, movies }
        const actorsData = await actorsResponse.json();           // { director, actors }
        // 合并数据:导演信息保持一致,同时增加合作演员列表
        combinedData = { ...filmographyData, actors: actorsData.actors };
  
        cypherQuery = `
          MATCH (d:Director {name: "${formattedQuery}"})-[:DIRECTED]->(m:Movie)
          OPTIONAL MATCH (m)<-[:ACTED_IN]-(a:Actor)
          WITH d as director, collect(DISTINCT m) as movies, collect(DISTINCT a) as actors
          RETURN director, movies, actors
        `;
      }
  
      // 将构造好的 Cypher 查询保存到状态（用于页面显示）
      setCurrentQuery(cypherQuery);
  
      // 检查返回的数据是否为空,根据不同类型的条件判断
      if (
        !combinedData ||
        (type === "actor" &&
          (!combinedData.actor || !combinedData.movies?.length)) ||
        (type === "movie" &&
          (!combinedData.movie || !combinedData.actors?.length)) ||
        (type === "director" &&
          (!combinedData.director ||
            (!combinedData.movies?.length && !combinedData.actors?.length)))
      ) {
        setNotFound(true);
        setSearchResults(null);
        setGraphData({ nodes: [], links: [] });
      } else {
        setSearchResults(combinedData);
        setGraphData(transformToGraphData(combinedData, type));
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      setLoading(false);
    }
  };  

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node);
  
    if (node.type === "movie") {
      setSearchQuery(node.name);
      setSearchType("movie");
      await handleSearch(node.name, "movie");
    } else if (node.type === "actor") {
      setSearchQuery(node.name);
      setSearchType("actor");
      await handleSearch(node.name, "actor");
    } else if (node.type === "director") {
      setSearchQuery(node.name);
      setSearchType("director");
      await handleSearch(node.name, "director");
    }
  }, []);
  

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleNavigation = (path) => {
    // Reset all states
    setSearchQuery("");
    setSelectedNode(null);
    setSearchResults(null);
    setGraphData({ nodes: [], links: [] });
    setCurrentQuery("");
    setNotFound(false);
    setLastSearchedQuery("");

    // Navigate to the new path
    router.push(path);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <Card className="max-w-6xl mx-auto">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle> Chinese Movie Database Explorer </CardTitle>
            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleNavigation("/actors")}
              >
                <User size={16} />
                View All Actors
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleNavigation("/movies")}
              >
                <Film size={16} />
                View All Movies
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => handleNavigation("/directors")}
              >
                <User size={16} />
                View All Directors
              </Button>
              <Button
                variant="outline"
                className="flex items-center gap-2 bg-red-500 text-white hover:bg-red-600"
                onClick={handleClearDB}
              >
                <DatabaseBackup size={16} />
                Clear DB
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense>
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchType={searchType}
              onSearch={(suggestion) => handleSearch(suggestion || searchQuery)}
              onTypeChange={handleTypeChange}
            />
          </Suspense>
          {!hasActors && (
            <WelcomeMessage
              onImportData={handleImportData}
              onBulkImportData={handleBulkImportData}
              isLoading={isSeeding}
            />
          )}

          {error && (
            <div className="text-red-500 mb-4 p-4 bg-red-50 rounded-lg mt-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          ) : notFound ? (
            <NotFoundMessage
              type={searchType}
              query={lastSearchedQuery}
            />
          ) : graphData.nodes.length > 0 ? (
            <div className="space-y-8">
              {searchResults && (
                <DetailsCard data={searchResults} type={searchType} />
              )}
              {/* Add Checkbox Toggle */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-cypher"
                  checked={showCypherQuery}
                  onCheckedChange={setShowCypherQuery}
                />
                <label
                  htmlFor="show-cypher"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Show Cypher Query
                </label>
              </div>

              {/* Conditionally Render CypherQueryDisplay */}
              {showCypherQuery && <CypherQueryDisplay query={currentQuery} />}

              {/* Graph Visualization */}
              <div className="h-[600px] border rounded-lg overflow-hidden bg-white relative">
                <ForceGraph2D
                  ref={ForceGraphRef}
                  graphData={graphData}
                  nodeLabel="name"
                  nodeColor={(node) =>
                    selectedNode?.id === node.id
                      ? "#fbbf24"
                      : node.type === "actor"
                      ? "#ff6b6b"
                      : node.type === "director"
                      ? "#a78bfa"
                      : node.type === "movie"
                      ? "#4ecdc4"
                      : "#000000"
                  }
                  width={window.innerWidth * 0.65}
                  height={600}
                  centerAt={[window.innerWidth * 0.25, 300]}
                  nodeRelSize={8}
                  linkWidth={2}
                  linkColor={() => "#cbd5e1"}
                  backgroundColor="#ffffff"
                  onNodeClick={handleNodeClick}
                  enableZoom={true}
                  minZoom={0.5}
                  maxZoom={4}
                  cooldownTicks={50}
                  linkDistance={100}
                  d3AlphaDecay={0.02}
                  d3VelocityDecay={0.3}
                  autoPauseRedraw={false}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 12 / globalScale;
                    const isSelected = selectedNode?.id === node.id;
                  
                    ctx.beginPath();
                    ctx.arc(
                      node.x,
                      node.y,
                      isSelected ? 8 : 5,
                      0,
                      2 * Math.PI,
                      false
                    );
                  
                    // 根据节点类型选择填充颜色
                    ctx.fillStyle = isSelected
                      ? "#fbbf24"
                      : node.type === "actor"
                      ? "#ff6b6b"
                      : node.type === "director"
                      ? "#a78bfa"
                      : node.type === "movie"
                      ? "#4ecdc4"
                      : "#000000";
                    ctx.fill();
                  
                    if (isSelected) {
                      ctx.strokeStyle = "#f59e0b";
                      ctx.lineWidth = 2;
                      ctx.stroke();
                    }
                  
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "#000000";
                    ctx.fillText(label, node.x, node.y + 12);
                  }}
                  onEngineStop={() => {
                    const graphBounds = {
                      x: { min: Infinity, max: -Infinity },
                      y: { min: Infinity, max: -Infinity },
                    };

                    graphData.nodes.forEach((node) => {
                      graphBounds.x.min = Math.min(
                        graphBounds.x.min,
                        node.x || 0
                      );
                      graphBounds.x.max = Math.max(
                        graphBounds.x.max,
                        node.x || 0
                      );
                      graphBounds.y.min = Math.min(
                        graphBounds.y.min,
                        node.y || 0
                      );
                      graphBounds.y.max = Math.max(
                        graphBounds.y.max,
                        node.y || 0
                      );
                    });

                    const graphWidth = graphBounds.x.max - graphBounds.x.min;
                    const graphHeight = graphBounds.y.max - graphBounds.y.min;
                    const graphCenter = {
                      x: (graphBounds.x.min + graphWidth / 2) * 0.6,
                      y: graphBounds.y.min + graphHeight / 2,
                    };

                    const zoomLevel =
                      Math.min(
                        (window.innerWidth * 0.65) / graphWidth,
                        600 / graphHeight
                      ) * 0.9;

                    ForceGraphRef.current?.centerAt(
                      graphCenter.x,
                      graphCenter.y,
                      1000
                    );
                    ForceGraphRef.current?.zoom(zoomLevel, 1000);
                  }}
                />
              </div>
              {/* Graph Legend */}
              <div className="flex gap-4 justify-center text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[#ff6b6b] mr-2"></div>
                  <span>Actors</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[#4ecdc4] mr-2"></div>
                  <span>Movies</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-[#a78bfa] mr-2"></div>
                  <span>Directors</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center italic">
                * Graph visualization shows only the first 25 connections for
                better readability. See complete list below.
              </p>
              {/* Results List */}
              <div className="space-y-4">
                {searchType === "actor" && searchResults?.movies && (
                  <>
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-xl font-semibold">Filmography (Newest First)</h2>
                      <div className="text-sm text-gray-500">
                        {`${searchResults.movies.length} movies`}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.movies.map((movie, index) => (
                        <Card
                          key={index}
                          className={`cursor-pointer transition-colors ${
                            selectedNode?.id === movie.title
                              ? "bg-yellow-50 border-yellow-400"
                              : ""
                          }`}
                          onClick={() =>
                            handleNodeClick({
                              id: movie.title,
                              name: movie.title,
                              type: "movie",
                              release_date: movie.release_date,
                            })
                          }
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <h3 className="font-semibold">{movie.title}</h3>
                              {movie.release_date && (
                                <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                                  {movie.release_date}
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
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-xl font-semibold">Co-directors</h2>
                      <div className="text-sm text-gray-500">
                        {`${searchResults.directors.length} directors`}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.directors.map((director, index) => (
                        <Card
                          key={index}
                          className={`cursor-pointer transition-colors ${
                            selectedNode?.id === director.name
                              ? "bg-yellow-50 border-yellow-400"
                              : ""
                          }`}
                          onClick={() =>
                            handleNodeClick({
                              id: director.name,
                              name: director.name,
                              type: "director",
                            })
                          }
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <h3 className="font-semibold">{director.name}</h3>
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Click to see director info
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {searchType === "movie" && searchResults?.actors && (
                  <>
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-xl font-semibold">Cast</h2>
                      <div className="text-sm text-gray-500">
                        {`${searchResults.actors.length} actors`}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.actors.map((actor, index) => (
                        <Card
                          key={index}
                          className={`cursor-pointer transition-colors ${
                            selectedNode?.id === actor.name
                              ? "bg-yellow-50 border-yellow-400"
                              : ""
                          }`}
                          onClick={() =>
                            handleNodeClick({
                              id: actor.name,
                              name: actor.name,
                              type: "actor",
                            })
                          }
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <h3 className="font-semibold">{actor.name}</h3>
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Click to see filmography
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-xl font-semibold">Director</h2>
                      <div className="text-sm text-gray-500">
                        {`${searchResults.directors.length} directors`}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.directors.map((director, index) => (
                        <Card
                          key={index}
                          className={`cursor-pointer transition-colors ${
                            selectedNode?.id === director.name
                              ? "bg-yellow-50 border-yellow-400"
                              : ""
                          }`}
                          onClick={() =>
                            handleNodeClick({
                              id: director.name,
                              name: director.name,
                              type: "director",
                            })
                          }
                        >
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <h3 className="font-semibold">{director.name}</h3>
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              Click to see director info
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {searchType === "director" && searchResults?.director && (
                  <>
                    {/* 显示导演执导电影列表 */}
                    {searchResults.movies && searchResults.movies.length > 0 && (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <h2 className="text-xl font-semibold">
                            Filmography (Newest First)
                          </h2>
                          <div className="text-sm text-gray-500">
                            {`${searchResults.movies.length} movies`}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                          {searchResults.movies.map((movie, index) => (
                            <Card
                              key={index}
                              className={`cursor-pointer transition-colors ${
                                selectedNode?.id === movie.title
                                  ? "bg-yellow-50 border-yellow-400"
                                  : ""
                              }`}
                              onClick={() =>
                                handleNodeClick({
                                  id: movie.title,
                                  name: movie.title,
                                  type: "movie",
                                  release_date: movie.release_date,
                                })
                              }
                            >
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start">
                                  <h3 className="font-semibold">{movie.title}</h3>
                                  {movie.release_date && (
                                    <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                                      {movie.release_date}
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
                      </>
                    )}
                    {/* 显示导演合作过的演员列表 */}
                    {searchResults.actors && searchResults.actors.length > 0 && (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <h2 className="text-xl font-semibold">
                            Collaborating Actors
                          </h2>
                          <div className="text-sm text-gray-500">
                            {`${searchResults.actors.length} actors`}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {searchResults.actors.map((actor, index) => (
                            <Card
                              key={index}
                              className={`cursor-pointer transition-colors ${
                                selectedNode?.id === actor.name
                                  ? "bg-yellow-50 border-yellow-400"
                                  : ""
                              }`}
                              onClick={() =>
                                handleNodeClick({
                                  id: actor.name,
                                  name: actor.name,
                                  type: "actor",
                                })
                              }
                            >
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start">
                                  <h3 className="font-semibold">{actor.name}</h3>
                                </div>
                                <div className="mt-2 text-sm text-gray-500">
                                  Click to see filmography
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

            </div>
          ) : (
            <div className="text-center text-gray-500 h-96 flex items-center justify-center">
              Search for {searchType === "actor" ? "an actor" : "a movie"} to
              see their connections
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
