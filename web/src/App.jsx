import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Article from "./pages/Article.jsx";
import Search from "./pages/Search.jsx";
import Category from "./pages/Category.jsx";
import Recent from "./pages/Recent.jsx";
import Random from "./pages/Random.jsx";
import Edit from "./pages/Edit.jsx";
import Create from "./pages/Create.jsx";
import Setup from "./pages/Setup.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wiki/:id" element={<Article />} />
        <Route path="/wiki/:id/edit" element={<Edit />} />
        <Route path="/create" element={<Create />} />
        <Route path="/search" element={<Search />} />
        <Route path="/category/:name" element={<Category />} />
        <Route path="/special/recent" element={<Recent />} />
        <Route path="/special/random" element={<Random />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
