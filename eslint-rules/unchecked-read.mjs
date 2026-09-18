/**
 * A read whose failure is invisible.
 *
 *   const { data } = await supabase.from('transactions').select(...)
 *
 * When that query fails, `data` is null and the code carries on with
 * "nothing" -- which in this app has meant "nobody to email", "feature off",
 * "₦0 spent" and "no mailbox for this alert". Four production bugs in one
 * week, one shape. The rule: if you take `data` (or `count`) off an awaited
 * result, you take `error` too. What you do with it is yours; that you saw
 * it is not optional.
 *
 * Applies to the money paths only (see eslint.config.mjs). A screen that
 * shows a greeting may shrug at a failed read; a job that decides who is
 * told may not.
 */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Destructuring data/count from an awaited read without also taking error' },
    schema: [],
    messages: {
      unchecked:
        'This read takes `{{taken}}` but not `error`. A failed read is null here and reads as "nothing" -- take `error` and decide what a failure means.',
    },
  },
  create(context) {
    function keys(pattern) {
      return pattern.properties
        .filter((p) => p.type === 'Property' && p.key && p.key.type === 'Identifier')
        .map((p) => p.key.name)
    }

    function check(pattern) {
      if (!pattern || pattern.type !== 'ObjectPattern') return
      const names = keys(pattern)
      const takesData = names.includes('data') || names.includes('count')
      const takesError = names.includes('error')
      if (takesData && !takesError) {
        context.report({
          node: pattern,
          messageId: 'unchecked',
          data: { taken: names.includes('data') ? 'data' : 'count' },
        })
      }
    }

    return {
      VariableDeclarator(node) {
        if (!node.init || node.init.type !== 'AwaitExpression') return
        // supabase.auth.getUser(): a failed check is "not signed in", which
        // every caller already handles with a 401. Not a money read.
        const call = node.init.argument
        if (
          call &&
          call.type === 'CallExpression' &&
          call.callee.type === 'MemberExpression' &&
          call.callee.property.type === 'Identifier' &&
          call.callee.property.name === 'getUser'
        )
          return
        if (node.id.type === 'ObjectPattern') check(node.id)
        // const [{ data: a }, { data: b }] = await Promise.all([...])
        if (node.id.type === 'ArrayPattern') {
          for (const el of node.id.elements) check(el)
        }
      },
    }
  },
}

export default rule
