<template>
  <div style="font-family: system-ui; padding: 2rem;">
    <h1>Nuxt SSR DevTools demo</h1>
    <p>Open DevTools → SSR Fetches tab to inspect server-side fetches.</p>

    <h2>Posts (useFetch)</h2>
    <ul>
      <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
    </ul>

    <h2>User ($fetch direct)</h2>
    <pre>{{ user }}</pre>
  </div>
</template>

<script setup lang="ts">
const { data: posts } = await useFetch<Array<{ id: number, title: string }>>(
  'https://jsonplaceholder.typicode.com/posts?_limit=5',
)

const user = await $fetch<{ id: number, name: string }>(
  'https://jsonplaceholder.typicode.com/users/1',
)
</script>
