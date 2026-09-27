// Visor 3D Rockie Companion — orbit + video en la pantalla (companion-demo-soft-v2.mp4).
// Three se carga en lazy para no inflar el bundle inicial.
import { useEffect, useRef, useState } from 'react'

const GLB_SRC = '/models/rockie-device.glb?v=105-white-matte'
const VIDEO_SRC = '/landing/video/companion-demo-soft-v2.mp4?v=1'
const STAGE_BG = 0x2a82ad // var(--brand)

export default function HeroDevice3D({ desktop = false }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(!!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setReady(true)
          io.disconnect()
        }
      },
      { rootMargin: '120px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!ready) return undefined
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return undefined

    let disposed = false
    let raf = 0
    let paused = false
    let cleanup = () => {}

    ;(async () => {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
      if (disposed) return

      let width = wrap.clientWidth || 400
      let height = wrap.clientHeight || (desktop ? 320 : 240)

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor(STAGE_BG, 1)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(STAGE_BG)
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.05, 50)
      // Arranque lejos; se ajusta al cargar el GLB
      camera.position.set(0, 0.15, 1.6)

      scene.add(new THREE.HemisphereLight(0xffffff, 0xf0ebe5, 0.85))
      const key = new THREE.DirectionalLight(0xfffaf5, 0.7)
      key.position.set(2.2, 3.5, 2.8)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.45)
      fill.position.set(-2.5, 1.2, -1.5)
      scene.add(fill)
      // Sin rim azul: reflejaba el stage y la carcasa se leia plomo


      const controls = new OrbitControls(camera, canvas)
      controls.enableDamping = true
      controls.dampingFactor = 0.08
      controls.enablePan = false
      controls.minDistance = 0.6
      controls.maxDistance = 3.2
      controls.autoRotate = !reduceMotion
      controls.autoRotateSpeed = 0.85
      controls.target.set(0, 0, 0)

      const modelRoot = new THREE.Group()
      scene.add(modelRoot)

      const texLoader = new THREE.TextureLoader()
      const bodyAlbedo = await new Promise((resolve) => {
        texLoader.load(
          '/models/rockie-body-albedo.png?v=4',
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace
            t.wrapS = t.wrapT = THREE.RepeatWrapping
            t.repeat.set(2.2, 2.2)
            t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 4)
            resolve(t)
          },
          undefined,
          () => resolve(null),
        )
      })
      if (disposed) return

      const applyBodyGrain = (root) => {
        root.traverse((child) => {
          if (!child.isMesh) return
          const name = child.name || ''
          const matName = child.material?.name || ''
          const isBody =
            name.includes('Case') ||
            name.includes('Btn') ||
            matName.includes('Body')
          if (!isBody) return
          // Plastico prototipo mate BLANCO (sin roughnessMap ni luces azules)
          const m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xffffff),
            map: bodyAlbedo || null,
            roughness: 1.0,
            metalness: 0,
            envMapIntensity: 0,
          })
          m.name = 'RockieBody'
          child.material = m
        })
      }

      const video = document.createElement('video')
      video.src = VIDEO_SRC
      video.crossOrigin = 'anonymous'
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.preload = 'auto'
      let videoTex = null

      const playVideo = () => {
        const p = video.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }

      const applyScreenVideo = (root) => {
        videoTex = new THREE.VideoTexture(video)
        videoTex.colorSpace = THREE.SRGBColorSpace
        // GLTF UVs suelen ir con flipY=false; si se ve al reves, cambiar a true
        videoTex.flipY = false
        videoTex.minFilter = THREE.LinearFilter
        videoTex.magFilter = THREE.LinearFilter
        videoTex.generateMipmaps = false

        let hit = 0
        root.traverse((child) => {
          if (!child.isMesh) return
          const name = (child.name || '').toLowerCase()
          const matName = (child.material?.name || '').toLowerCase()
          const isScreen =
            name.includes('screen') ||
            matName.includes('screen') ||
            name === 'rockiescreen'
          if (!isScreen) return

          const m = new THREE.MeshStandardMaterial({
            map: videoTex,
            emissiveMap: videoTex,
            emissive: new THREE.Color(0xffffff),
            // Antes 1.0 + map + emissive = pantalla quemada / mucho brillo
            emissiveIntensity: 0.28,
            roughness: 0.55,
            metalness: 0.0,
            toneMapped: true,
          })
          m.name = 'RockieScreen'
          child.material = m
          hit += 1
        })
        if (hit === 0) {
          console.warn('[HeroDevice3D] No se encontro mesh RockieScreen')
        }
        playVideo()
      }

      const faceScreenToCamera = (root) => {
        let screen = null
        root.traverse((child) => {
          if (screen || !child.isMesh) return
          const name = (child.name || '').toLowerCase()
          if (name.includes('screen')) screen = child
        })
        if (!screen) {
          // Fallback: el eje mas corto suele ser el grosor; poner altura en Y
          root.rotation.x = -Math.PI / 2
          root.updateMatrixWorld(true)
          return
        }
        screen.updateMatrixWorld(true)
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
          screen.getWorldQuaternion(new THREE.Quaternion()),
        )
        if (normal.lengthSq() < 1e-8) return
        normal.normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(
          normal,
          new THREE.Vector3(0, 0, 1),
        )
        root.quaternion.premultiply(q)
        root.updateMatrixWorld(true)

        // Si el dial queda "arriba" del frame, el aparato esta al reves: girar 180 en Z
        let dial = null
        root.traverse((child) => {
          if (dial || !child.isMesh) return
          if ((child.name || '').toLowerCase().includes('dial')) dial = child
        })
        if (dial) {
          const dialY = dial.getWorldPosition(new THREE.Vector3()).y
          const scrY = screen.getWorldPosition(new THREE.Vector3()).y
          if (dialY > scrY) {
            root.rotateZ(Math.PI)
            root.updateMatrixWorld(true)
          }
        }
      }

      const loader = new GLTFLoader()
      loader.load(
        GLB_SRC,
        (gltf) => {
          if (disposed) return
          const obj = gltf.scene
          obj.updateMatrixWorld(true)
          // El bake Y-up deja la pantalla de canto; orientar frente a la camara (+Z)
          faceScreenToCamera(obj)

          const box = new THREE.Box3().setFromObject(obj)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const scale = 1.15 / maxDim
          obj.position.sub(center)
          obj.scale.setScalar(scale)
          obj.updateMatrixWorld(true)

          obj.traverse((child) => {
            if (!child.isMesh) return
            child.castShadow = false
            child.receiveShadow = false
            child.frustumCulled = false
          })
          applyBodyGrain(obj)
          modelRoot.add(obj)
          applyScreenVideo(obj)

          const fitted = new THREE.Box3().setFromObject(modelRoot)
          const sphere = fitted.getBoundingSphere(new THREE.Sphere())
          const fitDist =
            (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25
          controls.target.copy(sphere.center)
          controls.minDistance = Math.max(0.4, sphere.radius * 0.9)
          controls.maxDistance = Math.max(3.2, fitDist * 2.6)
          camera.position.set(
            sphere.center.x + fitDist * 0.28,
            sphere.center.y + fitDist * 0.12,
            sphere.center.z + fitDist,
          )
          controls.update()
        },
        undefined,
        (err) => {
          console.error('[HeroDevice3D] GLB load fail', err)
          const geo = new THREE.BoxGeometry(0.35, 0.55, 0.05)
          const mat = new THREE.MeshStandardMaterial({ color: 0xf0ebe5, roughness: 0.7 })
          modelRoot.add(new THREE.Mesh(geo, mat))
        },
      )

      const onPointer = () => {
        controls.autoRotate = false
      }
      wrap.addEventListener('pointerdown', onPointer)

      const resize = () => {
        width = wrap.clientWidth || width
        height = wrap.clientHeight || height
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setSize(width, height, false)
      }
      window.addEventListener('resize', resize)

      let io
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(
          ([entry]) => {
            paused = !entry?.isIntersecting
            if (!paused) playVideo()
            else video.pause()
          },
          { threshold: 0.05 },
        )
        io.observe(wrap)
      }

      const tick = () => {
        raf = requestAnimationFrame(tick)
        if (paused || disposed) return
        controls.update()
        if (videoTex) videoTex.needsUpdate = true
        renderer.render(scene, camera)
      }
      resize()
      tick()

      cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', resize)
        wrap.removeEventListener('pointerdown', onPointer)
        io?.disconnect()
        video.pause()
        video.removeAttribute('src')
        video.load()
        videoTex?.dispose()
        controls.dispose()
        renderer.dispose()
        scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose?.()
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            mats.forEach((m) => {
              m?.map?.dispose?.()
              m?.emissiveMap?.dispose?.()
              m?.dispose?.()
            })
          }
        })
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
  }, [ready, desktop, reduceMotion])

  return (
    <div
      ref={wrapRef}
      className="ld-hero-3d"
      style={{
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        minHeight: desktop ? 320 : 240,
      }}
    >
      {ready ? (
        <canvas
          ref={canvasRef}
          aria-label="Rockie Companion 3D, arrastra para orbitar. Pantalla con demo en video."
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            background: 'transparent',
            touchAction: 'none',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'var(--r-lg)',
            background: 'color-mix(in srgb, var(--card) 70%, transparent)',
          }}
        />
      )}
    </div>
  )
}
