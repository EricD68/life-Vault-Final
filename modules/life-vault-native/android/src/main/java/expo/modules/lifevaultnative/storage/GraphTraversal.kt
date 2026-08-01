package expo.modules.lifevaultnative.storage

import java.util.ArrayDeque

/**
 * Relationship traversal rules for upper-level ecosystem search.
 *
 * Shared platforms and projects are useful endpoints, but when they were not
 * the original search seed they are not used as bridges into sibling
 * ecosystems. This prevents a Guidance search from crossing Paddle into an
 * unrelated SpeechMe account merely because both use Paddle.
 */
object GraphTraversal {
    fun scopedDepths(
        seed: String,
        maxDepth: Int,
        adjacency: Map<String, Set<String>>,
        entityTypes: Map<String, String>,
    ): Map<String, Int> {
        val depthById = mutableMapOf(seed to 0)
        val queue = ArrayDeque<String>()
        queue.add(seed)
        val seedType = entityTypes[seed].orEmpty()

        while (queue.isNotEmpty()) {
            val current = queue.removeFirst()
            val depth = depthById[current] ?: 0
            if (depth >= maxDepth) continue

            val currentType = entityTypes[current].orEmpty()
            if (current != seed && currentType == "platform" && seedType != "platform") continue
            if (current != seed && currentType == "project" && seedType != "project") continue

            adjacency[current].orEmpty().forEach { next ->
                val nextDepth = depth + 1
                val previous = depthById[next]
                if (previous == null || nextDepth < previous) {
                    depthById[next] = nextDepth
                    queue.add(next)
                }
            }
        }
        return depthById
    }
}
