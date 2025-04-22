import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from py2neo import Graph, Node, Relationship, NodeMatcher
from typing import Optional, List
import logging
import requests
import re
from datetime import datetime
import asyncio
from pathlib import Path
import csv

app = FastAPI()

# Update root endpoint
@app.get("/", response_class=HTMLResponse)
async def root():
    return get_html_content()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Neo4j connection setup
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

PORT = os.getenv("PORT",8800)

# Connect to Neo4j
graph = Graph(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD),name="neo4j")
matcher = NodeMatcher(graph)

# Set up logging
logging.basicConfig(filename='api_log.txt', level=logging.INFO, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

# Load HTML content
# Update the HTML content loading to use a function
def get_html_content():
    html_path = Path(__file__).parent / "index.html"
    try:
        with open(html_path, "r", encoding='utf-8') as file:
            return file.read()
    except FileNotFoundError:
        logging.error(f"index.html not found at {html_path}")
        return "Error: index.html not found"
    except Exception as e:
        logging.error(f"Error reading index.html: {str(e)}")
        return f"Error reading index.html: {str(e)}"

# ============================= LOAD DATA =============================

@app.post("/clear")
async def import_data():
    try:
        # 清空当前 Neo4j 数据库中的所有数据
        graph.run("MATCH (n) DETACH DELETE n")
        
        return {"message": "DB cleared!"}
    except Exception as e:
        logging.error(f"Error clear data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/import")
async def import_data():
    try:
        # 清空当前 Neo4j 数据库中的所有数据
        graph.run("MATCH (n) DETACH DELETE n")

        # 定义 CSV 文件和图片文件夹路径（根据实际情况调整）
        movie_csv = "../Data/movies.csv"
        actor_csv = "../Data/actors.csv"
        director_csv = "../Data/directors.csv"
        movie_cover_folder = "/Data/movie_covers"
        actor_photo_folder = "/Data/actor_photos"
        director_photo_folder = "/Data/director_photos"

        # 导入演员和导演（先导入,确保存在）
        import_actors_from_csv(actor_csv, actor_photo_folder)
        import_directors_from_csv(director_csv, director_photo_folder)
        # 导入电影,并在导入时创建相应的关系
        import_movies_from_csv(movie_csv, movie_cover_folder)
        
        return {"message": "CSV数据导入成功"}
    except Exception as e:
        logging.error(f"Error importing CSV data: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/bulk_import")
async def bulk_import():
    try:
        graph.run("CREATE INDEX actor_name_index IF NOT EXISTS FOR (a:Actor) ON (a.name)")
        graph.run("CREATE INDEX director_name_index IF NOT EXISTS FOR (d:Director) ON (d.name)")
        graph.run("CREATE INDEX movie_title_index IF NOT EXISTS FOR (m:Movie) ON (m.title)")

        # 清空当前数据库中的所有数据
        graph.run("MATCH (n) DETACH DELETE n")

        # CSV 文件路径（确保文件位于 Neo4j 允许访问的导入目录中）
        actor_csv_url = "file:///actors.csv"
        director_csv_url = "file:///directors.csv"
        movie_csv_url = "file:///movies.csv"

        # 1. 批量导入演员节点，直接读取 CSV 中的“行号”列
        query_actor = f"""
        CALL {{
        LOAD CSV WITH HEADERS FROM "{actor_csv_url}" AS row
        MERGE (a:Actor {{name: row.姓名}})
        SET a.photo_path = '/Data/actor_photos/' + row.行号 + '.jpg'
        RETURN count(*) AS cnt
        }} IN TRANSACTIONS OF 500 ROWS
        RETURN 'OK' AS result;
        """
        graph.run(query_actor)

        # 2. 批量导入导演节点，直接读取 CSV 中的“行号”列
        query_director = f"""
        CALL {{
        LOAD CSV WITH HEADERS FROM "{director_csv_url}" AS row
        MERGE (d:Director {{name: row.姓名}})
        SET d.photo_path = '/Data/director_photos/' + row.行号 + '.jpg'
        RETURN count(*) AS cnt
        }} IN TRANSACTIONS OF 500 ROWS
        RETURN 'OK' AS result;
        """
        graph.run(query_director)

        # 3. 批量导入电影节点并创建关系
        query_movie = f"""
        CALL {{
        LOAD CSV WITH HEADERS FROM "{movie_csv_url}" AS row
        MERGE (m:Movie {{title: row.中文名}})
        SET m.english_title = row.英文名,
            m.genres = row.类型,
            m.release_date = row.上映时间,
            m.cover_path = '/Data/movie_covers/' + row.行号 + '_海报.jpg'
        WITH row, m
        // 为电影创建演员关系
        FOREACH (actorName IN split(row.演员, '、') |
            MERGE (a:Actor {{name: trim(actorName)}})
            MERGE (a)-[:ACTED_IN]->(m)
        )
        // 为电影创建导演关系，并建立演员与导演之间的合作关系
        FOREACH (directorName IN split(row.导演, '、') |
            MERGE (d:Director {{name: trim(directorName)}})
            MERGE (d)-[:DIRECTED]->(m)
            FOREACH (actorName IN split(row.演员, '、') |
            MERGE (a2:Actor {{name: trim(actorName)}})
            MERGE (a2)-[:COOPERATED_WITH]->(d)
            )
        )
        RETURN count(*) AS cnt
        }} IN TRANSACTIONS OF 500 ROWS
        RETURN 'OK' AS result;
        """
        graph.run(query_movie)

        return {"message": "Bulk CSV import successful using built-in LOAD CSV"}
    except Exception as e:
        logging.error(f"Error in bulk import: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def import_movies_from_csv(csv_file_path: str, cover_folder: str):
    with open(csv_file_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            # 提取电影属性
            title = row.get("中文名")
            english_title = row.get("英文名")
            genres_str = row.get("类型")
            genres = [g.strip() for g in genres_str.split(",")] if genres_str else []
            release_date = row.get("上映时间")
            actors_str = row.get("演员")
            directors_str = row.get("导演")
            
            # 设置电影封面路径
            cover_path = str(Path(cover_folder) / f"{idx}_海报.jpg")
            # 可以检测文件是否存在,或者根据实际情况处理
            
            # 创建或合并电影节点
            movie_node = Node("Movie",
                              title=title,
                              english_title=english_title,
                              genres=",".join(genres),
                              release_date=release_date,
                              cover_path=cover_path)
            graph.merge(movie_node, "Movie", "title")
            
            # 处理演员与导演关系（后续会建立关系）
            # 你可以在此直接调用另外的函数来建立关系：
            create_movie_relationships(movie_node, actors_str, directors_str)

def create_movie_relationships(movie_node, actors_str, directors_str, actor_photo_folder="actor_photos", director_photo_folder="director_photos"):
    # 处理演员
    if actors_str:
        actor_names = [name.strip() for name in actors_str.split("、") if name.strip()]
        for actor_name in actor_names:
            # 先尝试匹配已经存在的演员节点
            actor_node_existing = matcher.match("Actor", name=actor_name).first()
            if actor_node_existing:
                actor_node_to_use = actor_node_existing
            else:
                # 如果未找到，可以选择创建新节点，但使用默认或空的照片路径
                actor_node_to_use = Node("Actor", name=actor_name, photo_path="")  
                graph.merge(actor_node_to_use, "Actor", "name")
            # 建立演员出演电影的关系
            acted_rel = Relationship(actor_node_to_use, "ACTED_IN", movie_node)
            graph.merge(acted_rel)
    
    # 处理导演
    if directors_str:
        director_names = [name.strip() for name in directors_str.split("、") if name.strip()]
        for director_name in director_names:
            # 先尝试匹配已存在的导演节点
            director_node_existing = matcher.match("Director", name=director_name).first()
            if director_node_existing:
                director_node_to_use = director_node_existing
            else:
                director_node_to_use = Node("Director", name=director_name, photo_path="")
                graph.merge(director_node_to_use, "Director", "name")
            # 建立导演执导电影关系
            directed_rel = Relationship(director_node_to_use, "DIRECTED", movie_node)
            graph.merge(directed_rel)
  
            # 针对每个演员与该导演建立合作关系
            if actors_str:
                for actor_name in actor_names:
                    actor_node_existing = matcher.match("Actor", name=actor_name).first()
                    if actor_node_existing:
                        coop_rel = Relationship(actor_node_existing, "COOPERATED_WITH", director_node_to_use)
                        graph.merge(coop_rel)

def import_actors_from_csv(csv_file_path: str, actor_photo_folder="actor_photos"):
    with open(csv_file_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            name = row.get("姓名")
            if name:
                photo_path = str(Path(actor_photo_folder) / f"{idx}.jpg")
                actor_node = Node("Actor", name=name, photo_path=photo_path)
                graph.merge(actor_node, "Actor", "name")
                
def import_directors_from_csv(csv_file_path: str, director_photo_folder="director_photos"):
    with open(csv_file_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, start=1):
            name = row.get("姓名")
            if name:
                photo_path = str(Path(director_photo_folder) / f"{idx}.jpg")
                director_node = Node("Director", name=name, photo_path=photo_path)
                graph.merge(director_node, "Director", "name")

# ============================= BASIC STRUCTURE =============================

# 1.Node Structure

class Movie(BaseModel):
    title: str    # 中文名
    english_title: Optional[str] = None
    genres: Optional[List[str]] = None # 可以将"类型"按逗号拆分为列表
    release_date: Optional[str] = None # 上映时间
    cover_path: Optional[str] = None   # 电影封面图片路径

class Actor(BaseModel):
    name: str
    photo_path: Optional[str] = None   # 演员照片路径

class Director(BaseModel):
    name: str
    photo_path: Optional[str] = None   # 导演照片路径

# 2.Parameter Structure

class ActorInMovie(BaseModel): # 添加演员-电影关系
    actor_name: str
    movie_title: str

class DirectorInMovie(BaseModel): # 添加导演-导演关系
    director_name: str
    movie_title: str

# 3.Relationship Structure

class ActorFilmography(BaseModel): # 演员影史
    actor: Actor
    movies: List[Movie]

class DirectorFilmography(BaseModel): # 导演影史
    director: Director
    movies: List[Movie]

class DirectorActorList(BaseModel): # 导演合作过的演员
    director: Director
    actors: List[Actor]

class ActorDirectorList(BaseModel): # 演员合作过的导演
    actor: Actor
    directors: List[Director]

# ============================= ACTOR APIS =============================

@app.post("/actors", response_model=Actor)
async def create_actor(actor: Actor):
    try:
        actor_node = Node("Actor", **actor.model_dump())
        graph.create(actor_node)
        logging.info(f"Actor created: {actor.name}")
        return actor
    except Exception as e:
        logging.error(f"Error creating actor: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/actors/{name}", response_model=Actor)
async def read_actor(name: str):
    actor_node = matcher.match("Actor", name=name).first()
    if actor_node:
        return Actor(**dict(actor_node))
    raise HTTPException(status_code=404, detail="Actor not found")

@app.get("/actors", response_model=List[Actor])
async def read_actors():
    actors = matcher.match("Actor")
    return [Actor(**dict(actor)) for actor in actors]

@app.delete("/actors/{name}")
async def delete_actor(name: str):
    actor_node = matcher.match("Actor", name=name).first()
    if actor_node:
        graph.delete(actor_node)
        logging.info(f"Actor deleted: {name}")
        return {"message": f"Actor {name} deleted successfully"}
    raise HTTPException(status_code=404, detail="Actor not found")

# ============================= MOVIE APIS =============================

@app.post("/movies", response_model=Movie)
async def create_movie(movie: Movie):
    try:
        movie_node = Node("Movie", **movie.model_dump())
        graph.create(movie_node)
        logging.info(f"Movie created: {movie.title}")
        return movie
    except Exception as e:
        logging.error(f"Error creating movie: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/movies/{title}", response_model=Movie)
async def read_movie(title: str):
    movie_node = matcher.match("Movie", title=title).first()
    if movie_node:
        data = dict(movie_node)
        if isinstance(data.get("genres"), str):
            data["genres"] = [data["genres"]]
        return Movie(**data)
    raise HTTPException(status_code=404, detail="Movie not found")

@app.get("/movies", response_model=List[Movie])
async def read_movies():
    movies = matcher.match("Movie")
    result = []
    for movie in movies:
        data = dict(movie)
        if isinstance(data.get("genres"), str):
            data["genres"] = [data["genres"]]
        result.append(Movie(**data))
    return result

@app.delete("/movies/{title}")
async def delete_movie(title: str):
    movie_node = matcher.match("Movie", title=title).first()
    if movie_node:
        graph.delete(movie_node)
        logging.info(f"Movie deleted: {title}")
        return {"message": f"Movie {title} deleted successfully"}
    raise HTTPException(status_code=404, detail="Movie not found")

# ============================= DIRECTOR APIS =============================

@app.post("/directors", response_model=Director)
async def create_director(director: Director):
    try:
        # 使用 model_dump() 将 Pydantic 对象转换为字典，并创建一个 "Director" 标签的节点
        director_node = Node("Director", **director.model_dump())
        graph.create(director_node)
        logging.info(f"Director created: {director.name}")
        return director
    except Exception as e:
        logging.error(f"Error creating director: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/directors/{name}", response_model=Director)
async def read_director(name: str):
    director_node = matcher.match("Director", name=name).first()
    if director_node:
        return Director(**dict(director_node))
    raise HTTPException(status_code=404, detail="Director not found")

@app.get("/directors", response_model=List[Director])
async def read_directors():
    directors = matcher.match("Director")
    return [Director(**dict(director)) for director in directors]

@app.delete("/directors/{name}")
async def delete_director(name: str):
    director_node = matcher.match("Director", name=name).first()
    if director_node:
        graph.delete(director_node)
        logging.info(f"Director deleted: {name}")
        return {"message": f"Director {name} deleted successfully"}
    raise HTTPException(status_code=404, detail="Director not found")

# ============================= RELATIONSHIP APIS =============================

# 1.电影-演员关系

@app.post("/actor_in_movie")
async def add_actor_to_movie(relation: ActorInMovie): # 添加电影-演员关系
    try:
        actor_node = matcher.match("Actor", name=relation.actor_name).first()
        movie_node = matcher.match("Movie", title=relation.movie_title).first()
        
        if not actor_node:
            raise HTTPException(status_code=404, detail="Actor not found")
        if not movie_node:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        acted_in = Relationship(actor_node, "ACTED_IN", movie_node)
        graph.merge(acted_in)
        
        logging.info(f"Relationship added: {relation.actor_name} ACTED_IN {relation.movie_title}")
        return {"message": f"Relationship added: {relation.actor_name} ACTED_IN {relation.movie_title}"}
    except Exception as e:
        logging.error(f"Error adding relationship: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/actors/{name}/filmography", response_model=Optional[ActorFilmography])
async def get_actor_filmography(name: str): # 获取演员影史
    cypher_query = """
    MATCH (a:Actor {name: $name})-[:ACTED_IN]->(m:Movie)
    WITH a as actor, m
    ORDER BY COALESCE(m.release_date, '') DESC, m.title
    WITH actor, collect(m) as movies
    RETURN actor, movies
    """
    
    result = graph.run(cypher_query, name=name).data()
    
    if not result or not result[0]['actor']:
        return None
        
    actor_data = result[0]['actor']
    movies_data = result[0]['movies']
    
    return {
        "actor": {
            "name": actor_data["name"],
            "photo_path": actor_data.get("photo_path")
        },
        "movies": [
            {
                "title": movie["title"],
                "english_title": movie.get("english_title"),
                "genres": [g.strip() for g in movie["genres"].split(",")] if movie.get("genres") else [],
                "release_date": movie.get("release_date"),
                "cover_path": movie.get("cover_path")
            } for movie in movies_data
        ]
    }

@app.get("/movies/{title}/cast")
async def get_movie_cast(title: str): #获取电影演员阵容
    cypher_query = """
    MATCH (m:Movie {title: $title})
    OPTIONAL MATCH (a:Actor)-[:ACTED_IN]->(m)
    WITH m as movie, collect(a) as unsorted_actors
    WITH movie, [actor in unsorted_actors | actor {.*}] as actors_data
    RETURN movie, apoc.coll.sort(actors_data, '^.name') as actors
    """
    
    # If you don't have APOC installed, use this simpler query instead:
    alternative_query = """
    MATCH (m:Movie {title: $title})
    OPTIONAL MATCH (a:Actor)-[:ACTED_IN]->(m)
    WITH m as movie, a
    ORDER BY a.name
    WITH movie, collect(a) as actors
    RETURN movie, actors
    """
    
    try:
        # Try with APOC first
        result = graph.run(cypher_query, title=title).data()
    except Exception:
        # Fall back to alternative query if APOC is not available
        result = graph.run(alternative_query, title=title).data()
    
    if not result or not result[0]['movie']:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    movie_data = result[0]['movie']
    actors_data = result[0]['actors']
    
    return {
        "movie": {
            "title": movie_data["title"],
            "english_title": movie_data.get("english_title"),
            "genres": [g.strip() for g in movie_data["genres"].split(",")] if movie_data.get("genres") else [],
            "release_date": movie_data.get("release_date"),
            "cover_path": movie_data.get("cover_path")
        },
        "actors": [
            {
                "name": actor["name"],
                "photo_path": actor.get("photo_path")
            } for actor in actors_data if actor  # Filter out None values
        ]
    }

# 2.电影-导演关系

@app.post("/director_in_movie")
async def add_director_to_movie(relation: DirectorInMovie):
    try:
        # 查询导演节点（根据导演姓名）
        director_node = matcher.match("Director", name=relation.director_name).first()
        # 查询电影节点（根据电影标题）
        movie_node = matcher.match("Movie", title=relation.movie_title).first()
        
        if not director_node:
            raise HTTPException(status_code=404, detail="Director not found")
        if not movie_node:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        # 建立导演执导电影的关系，关系类型为 "DIRECTED"
        directed_rel = Relationship(director_node, "DIRECTED", movie_node)
        graph.merge(directed_rel)
        
        logging.info(f"Relationship added: {relation.director_name} DIRECTED {relation.movie_title}")
        return {"message": f"Relationship added: {relation.director_name} DIRECTED {relation.movie_title}"}
    except Exception as e:
        logging.error(f"Error adding relationship: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/directors/{name}/filmography", response_model=Optional[DirectorFilmography])
async def get_director_filmography(name: str): # 查询导演影史
    cypher_query = """
    MATCH (d:Director {name: $name})-[:DIRECTED]->(m:Movie)
    WITH d as director, m
    ORDER BY COALESCE(m.release_date, '') DESC, m.title
    WITH director, collect(m) as movies
    RETURN director, movies
    """
    
    result = graph.run(cypher_query, name=name).data()
    
    if not result or not result[0]['director']:
        return None
        
    director_data = result[0]['director']
    movies_data = result[0]['movies']
    
    return {
        "director": {
            "name": director_data["name"],
            "photo_path": director_data.get("photo_path")
        },
        "movies": [
            {
                "title": movie["title"],
                "english_title": movie.get("english_title"),
                "genres": [g.strip() for g in movie["genres"].split(",")] if movie.get("genres") else [],
                "release_date": movie.get("release_date"),
                "cover_path": movie.get("cover_path")
            } for movie in movies_data
        ]
    }

@app.get("/movies/{title}/directors")
async def get_movie_directors(title: str): #查询电影的导演阵容
    cypher_query = """
    MATCH (m:Movie {title: $title})
    OPTIONAL MATCH (d:Director)-[:DIRECTED]->(m)
    WITH m as movie, collect(d) as directors
    RETURN movie, directors
    """
    
    result = graph.run(cypher_query, title=title).data()
    
    if not result or not result[0]['movie']:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    movie_data = result[0]['movie']
    directors_data = result[0]['directors']
    
    return {
        "movie": {
            "title": movie_data["title"],
            "english_title": movie_data.get("english_title"),
            "genres": [g.strip() for g in movie_data["genres"].split(",")] if movie_data.get("genres") else [],
            "release_date": movie_data.get("release_date"),
            "cover_path": movie_data.get("cover_path")
        },
        "directors": [
            {
                "name": director["name"],
                "photo_path": director.get("photo_path")
            } for director in directors_data if director  # 过滤掉 None 值
        ]
    }

# 3.导演-演员关系

@app.get("/directors/{name}/actors", response_model=DirectorActorList)
async def get_director_actors(name: str):  # 查询某导演直接合作过的演员列表
    cypher_query = """
    MATCH (a:Actor)-[:COOPERATED_WITH]->(d:Director {name: $name})
    RETURN d as director, collect(DISTINCT a) as actors
    """
    
    result = graph.run(cypher_query, name=name).data()
    
    if not result or not result[0].get('director'):
        raise HTTPException(status_code=404, detail="Director not found")
        
    director_data = result[0]['director']
    actors_data = result[0]['actors']
    
    return {
        "director": {
            "name": director_data["name"],
            "photo_path": director_data.get("photo_path")
        },
        "actors": [
            {
                "name": actor.get("name"),
                "photo_path": actor.get("photo_path")
            } for actor in actors_data if actor is not None
        ]
    }

@app.get("/actors/{name}/directors", response_model=ActorDirectorList)
async def get_actor_directors(name: str):  # 查询某演员直接合作过的导演列表
    cypher_query = """
    MATCH (a:Actor {name: $name})-[:COOPERATED_WITH]->(d:Director)
    RETURN a as actor, collect(DISTINCT d) as directors
    """
    result = graph.run(cypher_query, name=name).data()
    
    if not result or not result[0].get('actor'):
        raise HTTPException(status_code=404, detail="Actor not found")
    
    actor_data = result[0]['actor']
    directors_data = result[0]['directors']
    
    return {
        "actor": {
            "name": actor_data.get("name"),
            "photo_path": actor_data.get("photo_path")
        },
        "directors": [
            {
                "name": director.get("name"),
                "photo_path": director.get("photo_path")
            } for director in directors_data if director is not None
        ]
    }

# ============================= SEARCH APIS =============================

@app.get("/autocomplete/{search_type}")
async def autocomplete(search_type: str, query: str = Query(..., min_length=1)):
    if search_type not in ['actor', 'movie']:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    # Define label based on search type
    if search_type == 'actor':
        label, property_name = 'Actor', 'name'
    elif search_type == 'movie':
        label, property_name = 'Movie', 'title'
    else:  # director
        label, property_name = 'Director', 'name'
    
    # Modified Cypher query to handle both exact and partial matches
    cypher_query = f"""
    MATCH (n:{label})
    WHERE toLower(n.{property_name}) CONTAINS toLower($query)
    WITH n, 
         CASE WHEN toLower(n.{property_name}) = toLower($query) THEN 0
              WHEN toLower(n.{property_name}) STARTS WITH toLower($query) THEN 1
              ELSE 2 END as relevance
    ORDER BY relevance, n.{property_name}
    RETURN n.{property_name} AS name, relevance
    LIMIT 10
    """
    
    try:
        results = graph.run(cypher_query, query=query).data()
        
        # Format results
        suggestions = [result['name'] for result in results]
        return suggestions
        
    except Exception as e:
        logging.error(f"Error in autocomplete: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    
@app.get("/search/{search_type}")
async def search(search_type: str, query: str = Query(..., min_length=1)):
    if search_type not in ['actor', 'movie', 'director']:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    if search_type == 'actor':
        label, property_name = 'Actor', 'name'
    elif search_type == 'movie':
        label, property_name = 'Movie', 'title'
    else:  # director
        label, property_name = 'Director', 'name'
    
    cypher_query = f"""
    MATCH (n:{label})
    WHERE toLower(n.{property_name}) CONTAINS toLower($query)
    WITH n,
         CASE WHEN toLower(n.{property_name}) = toLower($query) THEN 0
              WHEN toLower(n.{property_name}) STARTS WITH toLower($query) THEN 1
              ELSE 2 END as relevance
    ORDER BY relevance, n.{property_name}
    RETURN n
    LIMIT 20
    """
    
    try:
        results = graph.run(cypher_query, query=query).data()
        return [dict(result['n']) for result in results]
    except Exception as e:
        logging.error(f"Error in search: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
    
# ==========================================================

@app.get("/health")
async def health_check():
    try:
        # Test Neo4j connection
        neo4j_status = graph.run("RETURN 1").evaluate() == 1
    except Exception:
        neo4j_status = False

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "neo4j": "up" if neo4j_status else "down",
            "api": "up"
        }
    }    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8800)