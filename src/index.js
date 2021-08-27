import * as solparser from 'solidity-parser-antlr'
import {Graph} from 'graphlib'
import * as dot from 'graphlib-dot'

const SEND_NODE_NAME = 'UNTRUSTED'
const SEND_NODE_STYLE = {
    shape: 'rectangle'
}

const COLORS = {
    SEND: 'red',
    CONSTANT: 'blue',
    CALL: 'orange',
    INTERNAL: 'gray',
    VIEW: 'yellow',
    PURE: 'green',
    TRANSFER: 'purple',
    PAYABLE: 'brown'
}

const prop = name => object => object[name]
const propEquals = (name, value) => object => object[name] === value
const wrap = val => Array.isArray(val) ? val : [val]

/** Converts an AST to array. */
const flatten = ast => {
    const children = wrap(ast.body || ast.children || ast.subNodes || ast.statements || ast.expression || ast.eventCall || ast.left || ast.right || ast.literal || [])
    return [ast].concat(... children.map(flatten))
}

/** Finds all call expression nodes in an AST. */
const callees = ast => {
    return flatten(ast).filter(node => {
        return node.type === 'FunctionCall' && node.expression.name !== 'require' && node.expression.name !== 'assert'
    })
}

/** Determines the name of the graph node to render from the AST node. */
const graphNodeName = name => {
    return name === 'send' ? SEND_NODE_NAME : name
}

export default source => { // parse the Solidity source
    let ast
    try {
        ast = solparser.parse(source, {tolerant: true})
    } catch (e) {
        console.error('Parse error. Please report to https://github.com/federicobond/solidity-parser-antlr.')
        console.error(e)
        process.exit(1)
    }

    // get a list of all function nodes
    const functionNodes = flatten(ast).filter(propEquals('type', 'FunctionDefinition'))

    // analyze the security of the functions
    const analyzedNodes = functionNodes.map(node => {
        const functionCallees = callees(node).map(node => node.expression)

        return {
            name: graphNodeName(node.name),
            callees: functionCallees,
            send: functionCallees.some(callee => {
                return(callee.memberName || callee.expression && callee.expression.memberName) === 'send';
            }),
            transfer: functionCallees.some(callee => {
                return(callee.memberName || callee.expression && callee.expression.memberName) === 'transfer';
            }),
            constant: propEquals('stateMutability', 'constant')(node), // not sure
            internal: propEquals('visibility', 'internal')(node),
            view: propEquals('stateMutability', 'view')(node),
            pure: propEquals('stateMutability', 'pure')(node), // not sure
            payable: propEquals('stateMutability', 'payable')(node),
            isconstructor: propEquals('isConstructor', true)(node)
        }
    })

    // console.log(JSON.stringify(ast, null, 2))
    // console.log(JSON.stringify(analyzedNodes, null, 2))

    // generate a graph
    var digraph = new Graph()
    analyzedNodes.forEach(({
        name,
        callees,
        send,
        constant,
        internal,
        view,
        pure,
        transfer,
        payable,
        isconstructor
    }) => { // node
        digraph.setNode(isconstructor ? "constructor" : graphNodeName(name), send ? {
            color: COLORS.SEND
        } : constant ? {
            color: COLORS.CONSTANT
        } : internal ? {
            color: COLORS.INTERNAL
        } : view ? {
            color: COLORS.VIEW
        } : pure ? {
            color: COLORS.PURE
        } : transfer ? {
            color: COLORS.TRANSFER
        } : payable ? {
            color: COLORS.PAYABLE
        } : {})

        // edge
        callees.forEach(callee => {
            const calleeName = callee.expression && callee.expression.memberName || callee.memberName || callee.name;
            digraph.setEdge(name, graphNodeName(calleeName))
        })
    })

    // add send node
    if (analyzedNodes.some(prop('send'))) {
        digraph.setNode(SEND_NODE_NAME, SEND_NODE_STYLE)
    }

    return dot.write(digraph)
}
